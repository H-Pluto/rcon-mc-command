# rcon-mc-command

[![npm version](https://img.shields.io/npm/v/rcon-mc-command.svg)](https://www.npmjs.com/package/rcon-mc-command)
[![license](https://img.shields.io/npm/l/rcon-mc-command.svg)](./LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-H--Pluto%2Frcon--mc--command-181717?logo=github)](https://github.com/H-Pluto/rcon-mc-command)

通过 RCON 协议连接 Minecraft Java 版服务器，并把常用指令封装成类型安全的 TypeScript 方法。

> 仓库地址：<https://github.com/H-Pluto/rcon-mc-command> · 问题反馈：<https://github.com/H-Pluto/rcon-mc-command/issues>

- 内置 RCON 协议实现，零运行时依赖（仅使用 Node 内置的 `node:net`）
- 根据 `registries.json` 自动生成 1600+ 物品的 `giveXxx` 方法与 40 种状态效果的 `effectXxx` 方法，写代码时有完整类型提示
- 参数校验与中文错误信息
- 也支持 `run()` 直接执行任意原始指令

## 环境要求

- Node.js >= 18
- 一个开启了 RCON 的 Minecraft Java 版服务器

## 服务端配置

在服务端的 `server.properties` 中开启 RCON，然后重启服务器：

```properties
enable-rcon=true
rcon.port=25575
rcon.password=换成你自己的密码
```

> RCON 协议是明文传输的，请勿将 RCON 端口暴露到公网，建议只在内网或本机使用。

## 安装

```bash
npm install rcon-mc-command
```

## 快速开始

```ts
import { MinecraftRcon, CommandClient } from 'rcon-mc-command'

const rcon = await MinecraftRcon.connect({
  host: '127.0.0.1',
  port: 25575,
  password: 'your-password',
})

const mc = new CommandClient(rcon)

// 查询在线玩家
console.log(await mc.list())

// 广播消息
await mc.say('服务器将在 5 分钟后重启')

// 给玩家发一把钻石剑和一个金苹果
await mc.giveDiamondSword('Steve', 1)
await mc.giveGoldenApple('Steve', 16)

// 给玩家 60 秒速度 II，并隐藏粒子效果
await mc.effectSpeed('Steve', 60, 1, true)

// 执行任意原始指令
await mc.run('time set day')

rcon.end()
```

## API

### `MinecraftRcon`

底层 RCON 客户端，负责连接、认证与收发数据包。

#### `MinecraftRcon.connect(options): Promise<MinecraftRcon>`

连接服务器并完成密码认证。

| 参数       | 类型     | 默认值  | 说明                                     |
| ---------- | -------- | ------- | ---------------------------------------- |
| `host`     | `string` | —       | 服务器地址                               |
| `port`     | `number` | `25575` | RCON 端口                                |
| `password` | `string` | —       | RCON 密码，需与 `server.properties` 一致 |
| `timeout`  | `number` | `5000`  | 连接与单次请求超时时间（毫秒）           |

连接失败、超时或密码错误时会抛出异常（密码错误信息为 `RCON 密码错误`）。

#### `send(command): Promise<string>`

执行一条指令并返回服务器响应的文本。

#### `end(): void`

关闭连接；尚未完成的请求会以 `RCON 连接已关闭` 拒绝。

### `CommandClient`

常用指令的封装。构造时传入一个已完成认证的 `MinecraftRcon`，连接的生命周期由调用方管理（`CommandClient` 不负责关闭连接）。

```ts
const mc = new CommandClient(rcon)
```

#### 服务器指令

| 方法                    | 说明             |
| ----------------------- | ---------------- |
| `run(command)`          | 执行任意原始指令 |
| `say(message)`          | 向全服广播消息   |
| `list()`                | 获取在线玩家列表 |
| `op(player)`            | 给予 OP 权限     |
| `deop(player)`          | 移除 OP 权限     |
| `kick(player, reason?)` | 将玩家踢出服务器 |

#### give 指令

每个物品都有一个 `give<物品名>` 方法。方法名由物品 id 转成驼峰命名后加 `give` 前缀，例如：

| 物品 id                   | 方法名                           |
| ------------------------- | -------------------------------- |
| `minecraft:diamond`       | `giveDiamond(player, size)`      |
| `minecraft:diamond_sword` | `giveDiamondSword(player, size)` |
| `minecraft:golden_apple`  | `giveGoldenApple(player, size)`  |

```ts
await mc.giveDiamond('Steve', 64)
```

- `player` 不能为空
- `size` 必须是大于 0 的整数
- 参数非法时会**同步抛出** `Error`

#### effect 指令

每个状态效果都有一个 `effect<效果名>` 方法：

```ts
effectXxx(player: string, seconds?: number, amplifier?: number, hideParticles?: boolean): Promise<string>
```

| 参数            | 默认值  | 说明                                |
| --------------- | ------- | ----------------------------------- |
| `player`        | —       | 玩家名                              |
| `seconds`       | `30`    | 持续时间（秒），必须是大于 0 的整数 |
| `amplifier`     | `0`     | 效果等级（0 表示 I 级），范围 0–255 |
| `hideParticles` | `false` | 是否隐藏粒子效果                    |

| 效果 id                  | 方法名                    |
| ------------------------ | ------------------------- |
| `minecraft:speed`        | `effectSpeed(...)`        |
| `minecraft:regeneration` | `effectRegeneration(...)` |
| `minecraft:night_vision` | `effectNightVision(...)`  |

```ts
await mc.effectSpeed('Steve', 60, 1)
await mc.effectRegeneration('Steve', 30, 2)
await mc.effectClear('Steve') // 清除玩家全部状态效果
```

参数非法时同样会**同步抛出** `Error`。

### 错误处理

```ts
try {
  const rcon = await MinecraftRcon.connect({ host, password })
  // ...
} catch (error) {
  // 连接失败 / RCON 连接超时 / RCON 密码错误
}
```

- `connect` 与 `send` 出错时以 Promise 拒绝的方式抛出
- `giveXxx` / `effectXxx` 的参数校验是同步抛出，需要用 `try / catch` 捕获

## 如何查找物品与效果的完整列表

方法名来自项目根目录的 `registries.json`（Minecraft 数据注册表）：把 id 去掉 `minecraft:` 前缀、按 `_` 分段首字母大写拼接即可。也可以用编辑器补全查看全部生成的 `give*` / `effect*` 方法，或直接用 `mc.run('give ...')` 执行原始指令。

## 开发

```bash
npm install
npm run build       # 编译到 dist/
npm test            # 运行测试
npm run lint        # 代码检查
npm run format      # 格式化代码
```

## License

[MIT](./LICENSE)
