/**
 * /visual-debug Command —— 视觉调试命令
 *
 * 功能：
 * 1. 使用 chokidar 监听文件变化
 * 2. 文件保存时自动触发截图
 * 3. 与"上次成功"截图进行对比
 * 4. 发现差异时通知用户
 * 5. 可选：自动产出修复建议
 *
 * Sprint: S3-1
 */

import type { Command } from '../../commands.js'
import type { Message } from '../../types/message.js'

/**
 * chokidar 动态导入类型
 */
type ChokidarModule = typeof import('chokidar')
type FSWatcher = import('chokidar').FSWatcher

/**
 * 视觉调试配置
 */
interface VisualDebugConfig {
  /** 监听目录 */
  watchDir: string
  /** 文件匹配模式 */
  patterns: string[]
  /** 截图保存目录 */
  screenshotDir: string
  /** 参考截图路径 */
  baselinePath?: string
  /** 自动对比 */
  autoCompare: boolean
  /** 相似度阈值 */
  similarityThreshold: number
  /** 延迟（保存后多久截图） */
  debounceMs: number
  /** 是否在浏览器中打开 */
  openBrowser: boolean
}

/**
 * 调试会话状态
 */
interface DebugSession {
  watcher: FSWatcher | null
  lastScreenshot: string | null
  baselineImage: string | null
  changeCount: number
  startTime: number
}

/**
 * 动态导入 chokidar
 */
async function getChokidar(): Promise<ChokidarModule> {
  try {
    return await import('chokidar')
  } catch {
    throw new Error(
      'chokidar 未安装。请运行: bun add chokidar'
    )
  }
}

/**
 * 当前会话（全局单例）
 */
let currentSession: DebugSession | null = null

/**
 * VisualDebug Command
 */
export const VisualDebugCommand: Command = {
  name: 'visual-debug',
  description: 'Start visual debugging mode. Watches files for changes, automatically captures screenshots on save, and compares with baseline images to detect visual regressions.',

  async *execute(
    args: string[],
    context: {
      submitMessage: (message: Message) => AsyncGenerator<Message, void, unknown>
      tools: any
    }
  ): AsyncGenerator<Message, void, unknown> {
    const subcommand = args[0]

    // 处理子命令
    if (subcommand === 'stop') {
      yield* stopSession()
      return
    }

    if (subcommand === 'status') {
      yield* getStatus()
      return
    }

    // 启动新会话
    const watchDir = args[0] || '.'
    const patterns = args.slice(1).length > 0 ? args.slice(1) : ['**/*.{tsx,jsx,css,scss,html}']

    const config: VisualDebugConfig = {
      watchDir,
      patterns,
      screenshotDir: `./.visual-debug/${Date.now()}`,
      autoCompare: true,
      similarityThreshold: 0.95,
      debounceMs: 1000,
      openBrowser: true,
    }

    // 停止现有会话
    if (currentSession?.watcher) {
      yield* stopSession()
    }

    yield {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'text',
            text: `🔍 Starting Visual Debug Mode\n\nWatching: ${config.watchDir}\nPatterns: ${config.patterns.join(', ')}\nScreenshots: ${config.screenshotDir}\n\nCommands:\n  /visual-debug stop - Stop watching\n  /visual-debug status - Show session status`,
          },
        ],
      },
      uuid: crypto.randomUUID(),
      toolUse: [],
    }

    // 创建截图目录
    yield* context.submitMessage({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'BashTool',
            input: {
              command: `mkdir -p ${config.screenshotDir}`,
              description: 'Create screenshot directory',
            },
          },
        ],
      },
    })

    // 启动 chokidar 监听
    try {
      const chokidar = await getChokidar()

      const watcher = chokidar.watch(config.patterns, {
        cwd: config.watchDir,
        ignoreInitial: true,
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/dist/**',
          '**/build/**',
          '**/.visual-debug/**',
        ],
        persistent: true,
      })

      currentSession = {
        watcher,
        lastScreenshot: null,
        baselineImage: config.baselinePath || null,
        changeCount: 0,
        startTime: Date.now(),
      }

      // 监听文件变化
      watcher.on('change', async (filePath) => {
        currentSession!.changeCount++

        const timestamp = Date.now()
        const screenshotPath = `${config.screenshotDir}/screenshot_${timestamp}.png`

        // 通知文件变化
        context.submitMessage({
          type: 'user',
          message: {
            content: [
              {
                type: 'text',
                text: `File changed: ${filePath}\nTaking screenshot...`,
              },
            ],
          },
        }).catch(() => {})

        // 延迟后截图（等待文件写入完成和页面刷新）
        await new Promise((resolve) => setTimeout(resolve, config.debounceMs))

        // 截图
        context.submitMessage({
          type: 'user',
          message: {
            content: [
              {
                type: 'tool_use',
                name: 'BrowserVisionTool',
                input: {
                  url: 'http://localhost:5173',
                  action: 'screenshot',
                  output_path: screenshotPath,
                },
              },
            ],
          },
        }).catch(() => {})

        // 对比（如果有 baseline）
        if (config.autoCompare && currentSession!.baselineImage) {
          await new Promise((resolve) => setTimeout(resolve, 500))

          context.submitMessage({
            type: 'user',
            message: {
              content: [
                {
                  type: 'tool_use',
                  name: 'ImageDiffTool',
                  input: {
                    image_a: currentSession!.baselineImage,
                    image_b: screenshotPath,
                    mode: 'both',
                    threshold: 1 - config.similarityThreshold,
                  },
                },
              ],
            },
          }).catch(() => {})
        }

        currentSession!.lastScreenshot = screenshotPath
      })

      watcher.on('add', (filePath) => {
        context.submitMessage({
          type: 'user',
          message: {
            content: [
              {
                type: 'text',
                text: `New file detected: ${filePath}`,
              },
            ],
          },
        }).catch(() => {})
      })

      watcher.on('unlink', (filePath) => {
        context.submitMessage({
          type: 'user',
          message: {
            content: [
              {
                type: 'text',
                text: `File removed: ${filePath}`,
              },
            ],
          },
        }).catch(() => {})
      })

      // 等待就绪
      await new Promise<void>((resolve) => {
        watcher.on('ready', () => {
          resolve()
        })
      })

      yield {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'text',
              text: `✅ Visual Debug Mode Active\n\nWatching for file changes...\n\nNext steps:\n1. Make changes to your code\n2. Save the file\n3. Screenshot will be captured automatically\n4. If baseline is set, diff will be generated`,
            },
          ],
        },
        uuid: crypto.randomUUID(),
        toolUse: [],
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      yield {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'text',
              text: `❌ Failed to start visual debug: ${errorMessage}`,
            },
          ],
        },
        uuid: crypto.randomUUID(),
        toolUse: [],
      }
    }
  },
}

/**
 * 停止会话
 */
async function* stopSession(): AsyncGenerator<Message, void, unknown> {
  if (!currentSession?.watcher) {
    yield {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'text',
            text: 'No active visual debug session.',
          },
        ],
      },
      uuid: crypto.randomUUID(),
      toolUse: [],
    }
    return
  }

  const duration = Date.now() - currentSession.startTime
  const changes = currentSession.changeCount

  await currentSession.watcher.close()
  currentSession = null

  yield {
    type: 'assistant',
    message: {
      content: [
        {
          type: 'text',
          text: `🛑 Visual Debug Mode Stopped\n\nSession duration: ${(duration / 1000).toFixed(1)}s\nFiles changed: ${changes}`,
        },
      ],
    },
    uuid: crypto.randomUUID(),
    toolUse: [],
  }
}

/**
 * 获取状态
 */
async function* getStatus(): AsyncGenerator<Message, void, unknown> {
  if (!currentSession) {
    yield {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'text',
            text: 'No active visual debug session.\n\nStart with: /visual-debug [directory] [patterns...]',
          },
        ],
      },
      uuid: crypto.randomUUID(),
      toolUse: [],
    }
    return
  }

  const duration = Date.now() - currentSession.startTime

  yield {
    type: 'assistant',
    message: {
      content: [
        {
          type: 'text',
          text: `📊 Visual Debug Session Status\n\nActive: ✅\nDuration: ${(duration / 1000).toFixed(1)}s\nFiles changed: ${currentSession.changeCount}\nLast screenshot: ${currentSession.lastScreenshot || 'N/A'}\nBaseline: ${currentSession.baselineImage || 'Not set'}`,
        },
      ],
    },
    uuid: crypto.randomUUID(),
    toolUse: [],
  }
}
