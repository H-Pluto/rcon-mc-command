import type { MinecraftRcon } from '../rcon.js'
import { createItemGiver } from '../factories/give.js'
import { createEffectCommands } from '../factories/effect.js'

type GiveMethods = ReturnType<typeof createItemGiver>
type EffectMethods = ReturnType<typeof createEffectCommands>

/**
 * 常用 Minecraft 指令的封装。
 *
 * 构造时传入一个已完成认证的 {@link MinecraftRcon} 连接，所有指令都通过该连接执行。
 * 连接的生命周期由创建方管理，本类不负责关闭连接；连接已关闭或响应超时时，
 * 各方法返回的 Promise 会以异常拒绝。
 */
export class CommandClient {
  private rcon: MinecraftRcon

  /**
   * @param rcon 已通过认证的 RCON 连接
   */
  constructor(rcon: MinecraftRcon) {
    this.rcon = rcon
    Object.assign(this, createItemGiver(rcon), createEffectCommands(rcon))
  }

  // ============ 服务器指令 ============

  /**
   * 执行任意指令。
   *
   * @param command 完整指令文本，例如 `time set day`
   * @returns 服务器返回的文本
   */
  run(command: string): Promise<string> {
    return this.rcon.send(command)
  }

  /**
   * 向全服广播一条消息。
   *
   * @param message 消息内容
   * @returns 服务器返回的文本
   */
  say(message: string): Promise<string> {
    return this.rcon.send(`say ${message}`)
  }

  /**
   * 获取在线玩家列表。
   *
   * @returns 服务器返回的文本，包含在线人数与玩家名
   */
  list(): Promise<string> {
    return this.rcon.send('list')
  }

  /**
   * 给予玩家 OP 权限。
   *
   * @param player 玩家名
   * @returns 服务器返回的文本
   */
  op(player: string): Promise<string> {
    return this.rcon.send(`op ${player}`)
  }

  /**
   * 移除玩家的 OP 权限。
   *
   * @param player 玩家名
   * @returns 服务器返回的文本
   */
  deop(player: string): Promise<string> {
    return this.rcon.send(`deop ${player}`)
  }

  /**
   * 将玩家踢出服务器。
   *
   * @param player 玩家名
   * @param reason 踢出原因，可选
   * @returns 服务器返回的文本
   */
  kick(player: string, reason?: string): Promise<string> {
    return this.rcon.send(reason ? `kick ${player} ${reason}` : `kick ${player}`)
  }
}

export declare interface CommandClient extends GiveMethods, EffectMethods {}
