/**
 * SessionRecorder —— 屏幕录制服务
 *
 * 使用 ffmpeg 录制屏幕到 mp4，支持：
 * - macOS: avfoundation (screen capture)
 * - Linux: x11grab / wayland
 * - Windows: dshow / gdigrab
 *
 * 功能：
 * - 开始/停止录制
 * - 自动分段（避免文件过大）
 * - 录制状态查询
 * - 优雅停止（确保文件完整）
 *
 * Sprint: S6-B1
 */

import { spawn, type ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import { mkdir, access } from 'fs/promises'
import { dirname } from 'path'
import { platform } from 'os'

/**
 * 录制配置
 */
export interface RecorderConfig {
  /** 输出目录 */
  outputDir: string
  /** 视频分辨率 */
  resolution: string
  /** 帧率 */
  fps: number
  /** 视频编码 */
  codec: string
  /** 质量 (CRF, 越低越好, 18-28 常用) */
  crf: number
  /** 预设 (ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow) */
  preset: string
  /** 自动分段时长（分钟，0 表示不分段） */
  segmentMinutes: number
}

/**
 * 录制会话
 */
export interface RecordingSession {
  /** 会话 ID */
  id: string
  /** 开始时间 */
  startTime: Date
  /** 输出文件路径 */
  outputPath: string
  /** 进程 */
  process: ChildProcess
  /** 配置 */
  config: RecorderConfig
}

/**
 * 录制状态
 */
export interface RecordingStatus {
  /** 是否正在录制 */
  isRecording: boolean
  /** 会话 ID */
  sessionId?: string
  /** 持续时间（毫秒） */
  durationMs?: number
  /** 输出文件路径 */
  outputPath?: string
  /** 文件大小（字节） */
  fileSize?: number
}

/**
 * SessionRecorder
 *
 * 管理屏幕录制生命周期
 */
export class SessionRecorder {
  private currentSession: RecordingSession | null = null
  private config: RecorderConfig

  constructor(config?: Partial<RecorderConfig>) {
    this.config = {
      outputDir: `${process.env.HOME}/.claude/sessions`,
      resolution: '1920x1080',
      fps: 25,
      codec: 'libx264',
      crf: 28,
      preset: 'veryfast',
      segmentMinutes: 0,
      ...config,
    }
  }

  /**
   * 检查 ffmpeg 是否可用
   */
  async checkFFmpeg(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn('ffmpeg', ['-version'])
      proc.on('error', () => resolve(false))
      proc.on('exit', (code) => resolve(code === 0))
    })
  }

  /**
   * 开始录制
   *
   * @returns 会话 ID
   */
  async startRecording(sessionId?: string): Promise<string> {
    if (this.currentSession) {
      throw new Error('Recording already in progress')
    }

    // 检查 ffmpeg
    const hasFFmpeg = await this.checkFFmpeg()
    if (!hasFFmpeg) {
      throw new Error('ffmpeg not found. Please install ffmpeg.')
    }

    // 创建输出目录
    await mkdir(this.config.outputDir, { recursive: true })

    const id = sessionId || randomUUID()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const outputPath = `${this.config.outputDir}/${id}_${timestamp}.mp4`

    // 根据平台选择录制方式
    const platform_cmd = this.getPlatformCommand(outputPath)

    const process = spawn('ffmpeg', platform_cmd.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    // 记录日志
    process.stderr?.on('data', (data) => {
      const msg = data.toString()
      // 只记录关键信息，避免日志过大
      if (msg.includes('Error') || msg.includes('Warning')) {
        console.error('[ffmpeg]', msg.substring(0, 200))
      }
    })

    process.on('exit', (code) => {
      if (code !== 0 && code !== 255) {
        console.error(`[SessionRecorder] ffmpeg exited with code ${code}`)
      }
    })

    this.currentSession = {
      id,
      startTime: new Date(),
      outputPath,
      process,
      config: this.config,
    }

    // 等待录制启动
    await new Promise((resolve) => setTimeout(resolve, 1000))

    return id
  }

  /**
   * 停止录制
   *
   * @returns 输出文件路径
   */
  async stopRecording(): Promise<string> {
    if (!this.currentSession) {
      throw new Error('No recording in progress')
    }

    const session = this.currentSession

    // 发送 SIGINT 让 ffmpeg 优雅停止
    session.process.kill('SIGINT')

    // 等待进程结束
    await new Promise<void>((resolve) => {
      session.process.on('exit', () => resolve())
      // 超时强制结束
      setTimeout(() => {
        try {
          session.process.kill('SIGKILL')
        } catch {}
        resolve()
      }, 5000)
    })

    this.currentSession = null

    // 验证文件
    try {
      await access(session.outputPath)
      return session.outputPath
    } catch {
      throw new Error('Recording file not created')
    }
  }

  /**
   * 获取录制状态
   */
  getStatus(): RecordingStatus {
    if (!this.currentSession) {
      return { isRecording: false }
    }

    const durationMs = Date.now() - this.currentSession.startTime.getTime()

    return {
      isRecording: true,
      sessionId: this.currentSession.id,
      durationMs,
      outputPath: this.currentSession.outputPath,
    }
  }

  /**
   * 获取平台特定的 ffmpeg 命令
   */
  private getPlatformCommand(outputPath: string): { args: string[] } {
    const { resolution, fps, codec, crf, preset } = this.config
    const [width, height] = resolution.split('x')

    switch (platform()) {
      case 'darwin':
        // macOS: avfoundation
        // 查找屏幕设备索引: ffmpeg -f avfoundation -list_devices true -i ""
        return {
          args: [
            '-f', 'avfoundation',
            '-framerate', String(fps),
            '-i', '1', // 1 = screen, 0 = default audio
            '-vf', `scale=${width}:${height}`,
            '-c:v', codec,
            '-crf', String(crf),
            '-preset', preset,
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            '-y', // 覆盖输出
            outputPath,
          ],
        }

      case 'linux':
        // Linux: x11grab
        const display = process.env.DISPLAY || ':0.0'
        return {
          args: [
            '-f', 'x11grab',
            '-framerate', String(fps),
            '-video_size', resolution,
            '-i', display,
            '-c:v', codec,
            '-crf', String(crf),
            '-preset', preset,
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            '-y',
            outputPath,
          ],
        }

      case 'win32':
        // Windows: gdigrab
        return {
          args: [
            '-f', 'gdigrab',
            '-framerate', String(fps),
            '-video_size', resolution,
            '-i', 'desktop',
            '-c:v', codec,
            '-crf', String(crf),
            '-preset', preset,
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            '-y',
            outputPath,
          ],
        }

      default:
        throw new Error(`Unsupported platform: ${platform()}`)
    }
  }

  /**
   * 列出历史录制
   */
  async listRecordings(): Promise<Array<{ path: string; size: number; created: Date }>> {
    const fs = await import('fs/promises')
    const path = await import('path')

    try {
      const files = await fs.readdir(this.config.outputDir)
      const recordings = await Promise.all(
        files
          .filter((f) => f.endsWith('.mp4'))
          .map(async (f) => {
            const filePath = path.join(this.config.outputDir, f)
            const stat = await fs.stat(filePath)
            return {
              path: filePath,
              size: stat.size,
              created: stat.birthtime,
            }
          })
      )
      return recordings.sort((a, b) => b.created.getTime() - a.created.getTime())
    } catch {
      return []
    }
  }
}

/**
 * 全局实例
 */
export const sessionRecorder = new SessionRecorder()
