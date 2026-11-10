import * as net from 'node:net'

const SERVERDATA_AUTH = 3
const SERVERDATA_EXECCOMMAND = 2

export interface RconOptions {
  host: string
  port?: number
  password: string
  timeout?: number
}

interface RconPacket {
  id: number
  type: number
  payload: string
}

interface PendingRequest {
  resolve: (packet: RconPacket) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Minecraft 服务器的 RCON 客户端。
 *
 * 请通过 {@link MinecraftRcon.connect} 创建实例；认证成功后即可用 {@link send} 执行指令，
 * 使用完毕后调用 {@link end} 关闭连接。
 */
export class MinecraftRcon {
  private socket: net.Socket
  private timeout: number
  private nextId = 1
  private buffer = Buffer.alloc(0)
  private pending = new Map<number, PendingRequest>()
  private authId: number | null = null
  private closed = false

  private constructor(socket: net.Socket, timeout: number) {
    this.socket = socket
    this.timeout = timeout

    socket.on('data', (data: Buffer) => this.onData(data))
    socket.on('error', (error) => this.failAll(error))
    socket.on('close', () => this.failAll(new Error('RCON 连接已关闭')))
  }

  /**
   * 连接 RCON 服务器并完成密码认证。
   *
   * @param options 连接配置
   * @param options.host 服务器地址
   * @param options.port RCON 端口，默认 `25575`
   * @param options.password RCON 密码，需与服务端 `server.properties` 中一致
   * @param options.timeout 连接与单次请求的超时时间（毫秒），默认 `5000`
   * @returns 已完成密码认证的客户端实例
   * @throws 连接失败、连接超时或密码错误（错误信息为 `RCON 密码错误`）时抛出异常
   * @example
   * ```ts
   * const rcon = await MinecraftRcon.connect({
   *   host: '127.0.0.1',
   *   port: 25575,
   *   password: 'secret',
   * })
   * ```
   */
  static connect(options: RconOptions): Promise<MinecraftRcon> {
    const { host, port = 25575, password, timeout = 5000 } = options

    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port })
      socket.setTimeout(timeout)

      const onConnectError = (error: Error) => {
        socket.destroy()
        reject(error)
      }

      socket.once('error', onConnectError)
      socket.once('timeout', () => onConnectError(new Error('RCON 连接超时')))

      socket.once('connect', () => {
        socket.setTimeout(0)
        socket.off('error', onConnectError)

        const client = new MinecraftRcon(socket, timeout)
        client.authenticate(password).then(
          () => resolve(client),
          (error) => {
            client.end()
            reject(error)
          },
        )
      })
    })
  }

  /**
   * 执行一条 RCON 指令并等待服务器响应。
   *
   * @param command 要执行的指令，例如 `list`、`time set day`
   * @returns 服务器返回的文本
   * @throws 连接已关闭或响应超时时抛出异常
   */
  send(command: string): Promise<string> {
    console.info(`执行指令: ${command}`)
    return this.request(SERVERDATA_EXECCOMMAND, command).then((packet) => packet.payload)
  }

  /**
   * 关闭连接，并拒绝所有尚未完成的请求。
   */
  end(): void {
    this.failAll(new Error('RCON 连接已关闭'))
    this.socket.end()
  }

  /**
   * 发送登录包并校验密码，密码错误时抛出 `RCON 密码错误`。
   *
   * @param password RCON 密码
   */
  private authenticate(password: string): Promise<void> {
    const id = this.nextId++
    this.authId = id

    return this.request(SERVERDATA_AUTH, password, id).then((packet) => {
      this.authId = null
      // 认证失败时服务器返回 id 为 -1 的响应包
      if (packet.id === -1) throw new Error('RCON 密码错误')
    })
  }

  /**
   * 发送一个数据包，并等待 id 匹配的响应包。
   *
   * @param type 数据包类型
   * @param payload 数据包内容
   * @param id 数据包 id，省略时自动递增
   */
  private request(type: number, payload: string, id = this.nextId++): Promise<RconPacket> {
    return new Promise((resolve, reject) => {
      if (this.closed) {
        reject(new Error('RCON 连接已关闭'))
        return
      }

      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('RCON 响应超时'))
      }, this.timeout)

      this.pending.set(id, { resolve, reject, timer })
      this.socket.write(this.encode(id, type, payload))
    })
  }

  /**
   * 按 RCON 协议编码数据包：长度(4) + id(4) + 类型(4) + 内容 + 两个 null 字节。
   */
  private encode(id: number, type: number, payload: string): Buffer {
    const body = Buffer.from(payload, 'utf8')
    // 包长度 = id(4) + type(4) + body + 两个 null 字节(2)
    const length = 10 + body.length
    const buffer = Buffer.alloc(4 + length)

    buffer.writeInt32LE(length, 0)
    buffer.writeInt32LE(id, 4)
    buffer.writeInt32LE(type, 8)
    body.copy(buffer, 12)

    return buffer
  }

  /**
   * 处理 socket 数据：按包长度切分缓冲区，并分发给等待中的请求。
   *
   * @param data 新到达的数据块
   */
  private onData(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data])

    while (this.buffer.length >= 4) {
      const length = this.buffer.readInt32LE(0)

      if (length < 10) {
        this.failAll(new Error('RCON 数据包长度非法'))
        this.socket.destroy()
        return
      }

      if (this.buffer.length < 4 + length) return

      const id = this.buffer.readInt32LE(4)
      const type = this.buffer.readInt32LE(8)
      const payload = this.buffer.toString('utf8', 12, 4 + length - 2)
      this.buffer = this.buffer.subarray(4 + length)

      // 密码错误时服务器返回 id=-1，需要回退到当前认证请求上
      const key = this.pending.has(id)
        ? id
        : id === -1 && this.authId !== null && this.pending.has(this.authId)
          ? this.authId
          : null
      if (key === null) continue

      const pending = this.pending.get(key)
      if (!pending) continue

      this.pending.delete(key)
      clearTimeout(pending.timer)
      pending.resolve({ id, type, payload })
    }
  }

  /**
   * 拒绝所有等待中的请求，并将客户端标记为已关闭。
   *
   * @param error 传递给各请求的拒绝原因
   */
  private failAll(error: Error): void {
    this.closed = true
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer)
      reject(error)
    }
    this.pending.clear()
  }
}
