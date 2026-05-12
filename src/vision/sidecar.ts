/**
 * Vision Sidecar RPC 客户端
 *
 * 管理 Python sidecar 进程，提供 JSON-RPC 通信能力。
 * 功能：
 * - 进程启动/监控/重启
 * - 请求/响应处理（LSP 格式）
 * - 超时控制
 * - 心跳检测
 * - 优雅关闭
 *
 * Sprint: S1-1
 */

import { spawn, type ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import { EventEmitter } from 'events'
import type { SidecarConfig, SidecarRequest, SidecarResponse } from './types.js'

/**
 * RPC 调用选项
 */
interface RPCCallOptions {
  /** 超时时间（毫秒） */
  timeoutMs?: number
  /** 是否允许缓存响应 */
  allowCache?: boolean
}

/**
 * Deferred Promise 辅助类
 */
class Deferred<T> {
  promise: Promise<T>
  resolve!: (value: T) => void
  reject!: (reason: unknown) => void

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
    })
  }
}

/**
 * Sidecar 进程状态
 */
type SidecarState = 'stopped' | 'starting' | 'running' | 'restarting' | 'error'

/**
 * Vision Sidecar 客户端
 *
 * 通过 stdio 与 Python sidecar 进程通信，使用 JSON-RPC 2.0 协议。
 */
export class VisionSidecar extends EventEmitter {
  private config: SidecarConfig
  private process: ChildProcess | null = null
  private state: SidecarState = 'stopped'
  private restartCount = 0

  // 消息处理
  private pendingRequests = new Map<string, Deferred<SidecarResponse>>()
  private messageBuffer = ''
  private contentLength = 0

  // 心跳
  private heartbeatTimer: NodeJS.Timeout | null = null
  private lastPongTime = 0

  constructor(config?: Partial<SidecarConfig>) {
    super()
    this.config = {
      pythonPath: 'python3',
      scriptPath: './vision_sidecar/run.py',
      startupTimeoutMs: 30000,
      requestTimeoutMs: 120000,
      heartbeatIntervalMs: 30000,
      maxRestarts: 3,
      ...config,
    }
  }

  /**
   * 启动 sidecar 进程
   */
  async start(): Promise<void> {
    if (this.state === 'running' || this.state === 'starting') {
      return
    }

    this.state = 'starting'
    this.emit('stateChange', this.state)

    try {
      await this.spawnProcess()
      await this.waitForReady()
      this.startHeartbeat()

      this.state = 'running'
      this.restartCount = 0
      this.emit('stateChange', this.state)
      this.emit('ready')
    } catch (error) {
      this.state = 'error'
      this.emit('stateChange', this.state, error)
      throw error
    }
  }

  /**
   * 停止 sidecar 进程
   */
  async stop(): Promise<void> {
    if (this.state === 'stopped') {
      return
    }

    this.stopHeartbeat()

    // 发送关闭通知
    if (this.process && !this.process.killed) {
      try {
        await this.notify('system.shutdown', {})
        // 给进程一点时间优雅退出
        await new Promise((resolve) => setTimeout(resolve, 500))
      } catch {
        // 忽略错误
      }

      this.process.kill('SIGTERM')

      // 等待进程退出
      await new Promise<void>((resolve) => {
        if (!this.process || this.process.killed) {
          resolve()
          return
        }

        const timeout = setTimeout(() => {
          this.process?.kill('SIGKILL')
          resolve()
        }, 5000)

        this.process.on('exit', () => {
          clearTimeout(timeout)
          resolve()
        })
      })
    }

    this.process = null
    this.state = 'stopped'
    this.emit('stateChange', this.state)
  }

  /**
   * 重启 sidecar 进程
   */
  async restart(): Promise<void> {
    if (this.restartCount >= this.config.maxRestarts) {
      throw new Error(
        `Sidecar 重启次数超过限制 (${this.config.maxRestarts})`
      )
    }

    this.state = 'restarting'
    this.restartCount++
    this.emit('restart', this.restartCount)

    await this.stop()
    await this.start()
  }

  /**
   * 执行 RPC 调用
   */
  async call<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    options: RPCCallOptions = {}
  ): Promise<T> {
    if (this.state !== 'running') {
      await this.start()
    }

    const timeoutMs = options.timeoutMs ?? this.config.requestTimeoutMs
    const id = randomUUID()

    const request: SidecarRequest = {
      id,
      method,
      params,
    }

    const deferred = new Deferred<SidecarResponse>()
    this.pendingRequests.set(id, deferred)

    // 设置超时
    const timeoutTimer = setTimeout(() => {
      this.pendingRequests.delete(id)
      deferred.reject(new Error(`RPC 调用超时: ${method} (${timeoutMs}ms)`))
    }, timeoutMs)

    try {
      await this.sendMessage(request)
      const response = await deferred.promise

      clearTimeout(timeoutTimer)

      if (response.error) {
        throw new SidecarError(
          response.error.code,
          response.error.message,
          response.error.data
        )
      }

      return response.result as T
    } catch (error) {
      clearTimeout(timeoutTimer)
      this.pendingRequests.delete(id)

      // 如果是进程错误，尝试重启
      if (this.isProcessError(error)) {
        await this.restart()
      }

      throw error
    }
  }

  /**
   * 发送通知（无需响应）
   */
  async notify(method: string, params: Record<string, unknown>): Promise<void> {
    if (!this.process || this.state !== 'running') {
      return
    }

    const notification = {
      jsonrpc: '2.0',
      method,
      params,
    }

    await this.sendRawMessage(notification)
  }

  /**
   * 检查 sidecar 是否健康
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.call<{ status: string }>('health.ping', {}, { timeoutMs: 5000 })
      return result.status === 'healthy'
    } catch {
      return false
    }
  }

  /**
   * 获取当前状态
   */
  getState(): SidecarState {
    return this.state
  }

  /**
   * 获取进程 PID
   */
  getPid(): number | null {
    return this.process?.pid ?? null
  }

  /**
   * 生成子进程
   */
  private spawnProcess(): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [this.config.scriptPath, '--log-level', 'INFO']

      this.process = spawn(this.config.pythonPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      })

      // 处理 stdout（RPC 响应）
      this.process.stdout?.on('data', (data: Buffer) => {
        this.handleData(data)
      })

      // 处理 stderr（日志）
      this.process.stderr?.on('data', (data: Buffer) => {
        const log = data.toString().trim()
        if (log) {
          this.emit('log', log)
        }
      })

      // 进程退出
      this.process.on('exit', (code, signal) => {
        this.emit('exit', code, signal)

        if (this.state === 'running') {
          // 非正常退出，尝试重启
          this.handleUnexpectedExit()
        }
      })

      // 进程错误
      this.process.on('error', (error) => {
        this.emit('error', error)
        reject(error)
      })

      // 等待进程启动
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          resolve()
        } else {
          reject(new Error('Sidecar 进程启动失败'))
        }
      }, 1000)
    })
  }

  /**
   * 等待 sidecar 就绪
   */
  private async waitForReady(): Promise<void> {
    const startTime = Date.now()

    while (Date.now() - startTime < this.config.startupTimeoutMs) {
      try {
        const result = await this.call<{ status: string }>(
          'health.ping',
          {},
          { timeoutMs: 5000 }
        )
        if (result.status) {
          return
        }
      } catch {
        // 继续等待
      }

      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    throw new Error(`Sidecar 启动超时 (${this.config.startupTimeoutMs}ms)`)
  }

  /**
   * 处理从 sidecar 接收的数据
   */
  private handleData(data: Buffer): void {
    this.messageBuffer += data.toString()

    // 处理 LSP 格式消息
    while (true) {
      // 如果正在等待 body，先尝试读取 body
      if (this.contentLength > 0) {
        const bufferLength = Buffer.byteLength(this.messageBuffer, 'utf8')
        if (bufferLength < this.contentLength) {
          break // 数据不完整，等待更多数据
        }

        const message = this.messageBuffer.slice(0, this.contentLength)
        this.messageBuffer = this.messageBuffer.slice(this.contentLength)
        this.contentLength = 0

        this.handleMessage(message)
        continue
      }

      // 解析头部
      const headerMatch = this.messageBuffer.match(/Content-Length: (\d+)\r\n\r\n/)
      if (!headerMatch) {
        // 可能数据还不够
        if (this.messageBuffer.length > 1000) {
          // 清理垃圾数据
          this.messageBuffer = ''
        }
        break
      }

      this.contentLength = parseInt(headerMatch[1], 10)
      this.messageBuffer = this.messageBuffer.slice(headerMatch[0].length)
    }
  }

  /**
   * 处理完整的消息
   */
  private handleMessage(message: string): void {
    try {
      const data = JSON.parse(message) as SidecarResponse & { method?: string }

      // 检查是否为响应（有 id）
      if ('id' in data && data.id !== undefined && data.id !== null) {
        const deferred = this.pendingRequests.get(data.id)
        if (deferred) {
          this.pendingRequests.delete(data.id)
          deferred.resolve(data)
        }
      }
      // 通知（无 id，有 method）
      else if (data.method) {
        this.handleNotification(data.method, data)
      }
    } catch (error) {
      this.emit('parseError', error, message)
    }
  }

  /**
   * 处理通知
   */
  private handleNotification(method: string, data: unknown): void {
    if (method === '$/progress') {
      this.emit('progress', data)
    } else {
      this.emit('notification', method, data)
    }
  }

  /**
   * 发送 RPC 消息
   */
  private async sendMessage(request: SidecarRequest): Promise<void> {
    const message = {
      jsonrpc: '2.0' as const,
      id: request.id,
      method: request.method,
      params: request.params,
    }

    await this.sendRawMessage(message)
  }

  /**
   * 发送原始消息
   */
  private sendRawMessage(message: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin || this.process.killed) {
        reject(new Error('Sidecar 进程未运行'))
        return
      }

      const json = JSON.stringify(message)
      const data = `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`

      this.process.stdin.write(data, (error) => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })
    })
  }

  /**
   * 启动心跳
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      try {
        const healthy = await this.healthCheck()
        if (healthy) {
          this.lastPongTime = Date.now()
        }
      } catch {
        // 心跳失败，检查是否需要重启
        if (Date.now() - this.lastPongTime > this.config.heartbeatIntervalMs * 2) {
          this.handleUnexpectedExit()
        }
      }
    }, this.config.heartbeatIntervalMs)
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /**
   * 处理意外退出
   */
  private handleUnexpectedExit(): void {
    if (this.state === 'running') {
      this.restart().catch((error) => {
        this.emit('error', error)
      })
    }
  }

  /**
   * 判断是否为进程错误
   */
  private isProcessError(error: unknown): boolean {
    if (error instanceof Error) {
      return (
        error.message.includes('ECONNRESET') ||
        error.message.includes('EPIPE') ||
        error.message.includes('进程') ||
        error.message.includes('process')
      )
    }
    return false
  }
}

/**
 * Sidecar 错误类
 */
export class SidecarError extends Error {
  code: number
  data?: unknown

  constructor(code: number, message: string, data?: unknown) {
    super(message)
    this.name = 'SidecarError'
    this.code = code
    this.data = data
  }
}

/**
 * 创建默认 sidecar 实例
 */
export function createSidecar(config?: Partial<SidecarConfig>): VisionSidecar {
  return new VisionSidecar(config)
}
