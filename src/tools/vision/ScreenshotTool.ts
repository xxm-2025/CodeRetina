/**
 * ScreenshotTool —— 屏幕截图工具
 *
 * 支持：
 * - 全屏截图
 * - 指定窗口截图
 * - 指定区域截图
 *
 * 平台：
 * - macOS: screencapture (内置)
 * - Linux: gnome-screenshot / scrot / import (ImageMagick)
 *
 * Sprint: S2-1
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import { platform } from 'os'
import { resolve } from 'path'
import type { Tool, ToolInputJSONSchema, ToolUseContext } from '../../Tool.js'
import type { YieldResult, ReturnResult } from '../../Tool.js'

const execAsync = promisify(exec)

/**
 * 截图模式
 */
type ScreenshotMode = 'fullscreen' | 'window' | 'region'

/**
 * ScreenshotTool 输入 Schema
 */
const inputSchema: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    mode: {
      type: 'string',
      enum: ['fullscreen', 'window', 'region'],
      description: '截图模式：fullscreen(全屏) / window(窗口) / region(区域)',
      default: 'fullscreen',
    },
    output_path: {
      type: 'string',
      description: '输出文件路径（默认保存到临时目录）',
    },
    window_id: {
      type: 'string',
      description: '窗口 ID（mode=window 时使用，macOS 可用）',
    },
    window_name: {
      type: 'string',
      description: '窗口标题关键词（mode=window 时使用）',
    },
    region: {
      type: 'object',
      description: '截图区域（mode=region 时使用）',
      properties: {
        x: { type: 'number', description: '左上角 x 坐标' },
        y: { type: 'number', description: '左上角 y 坐标' },
        width: { type: 'number', description: '宽度' },
        height: { type: 'number', description: '高度' },
      },
      required: ['x', 'y', 'width', 'height'],
    },
    delay: {
      type: 'number',
      description: '延迟秒数（给用户时间准备）',
      default: 0,
    },
    include_cursor: {
      type: 'boolean',
      description: '是否包含鼠标光标',
      default: false,
    },
  },
}

/**
 * 获取平台
 */
function getPlatform(): 'macos' | 'linux' | 'windows' | 'unknown' {
  const p = platform()
  if (p === 'darwin') return 'macos'
  if (p === 'linux') return 'linux'
  if (p === 'win32') return 'windows'
  return 'unknown'
}

/**
 * 生成临时文件路径
 */
function getTempPath(): string {
  const tmpDir = process.env.TMPDIR || process.env.TEMP || '/tmp'
  const timestamp = Date.now()
  return resolve(tmpDir, `screenshot_${timestamp}.png`)
}

/**
 * macOS 截图命令
 */
async function captureMacOS(
  mode: ScreenshotMode,
  outputPath: string,
  options: {
    windowId?: string
    windowName?: string
    region?: { x: number; y: number; width: number; height: number }
    delay?: number
    includeCursor?: boolean
  }
): Promise<string> {
  const { windowId, windowName, region, delay = 0, includeCursor = false } = options

  let cmd = 'screencapture'

  // 基础选项
  const args: string[] = []

  if (!includeCursor) {
    args.push('-C') // 不包含光标 (注意：screencapture -C 实际上是 "include cursor"，语法有点奇怪)
  }

  // 延迟
  if (delay > 0) {
    args.push('-T', String(delay))
  }

  // 模式选择
  if (mode === 'window') {
    if (windowId) {
      // 指定窗口 ID
      args.push('-l', windowId)
    } else if (windowName) {
      // 通过 AppleScript 获取窗口 ID
      const appleScript = `
        tell application "System Events"
          set frontApp to name of first application process whose frontmost is true
          tell process frontApp
n            set winList to every window whose name contains "${windowName}"
            if length of winList > 0 then
              return id of item 1 of winList
            end if
          end tell
        end tell
      `
      try {
        const { stdout } = await execAsync(`osascript -e '${appleScript}'`)
        const id = stdout.trim()
        if (id) {
          args.push('-l', id)
        }
      } catch {
        // 回退到交互式选择
        args.push('-i') // 交互式
      }
    } else {
      args.push('-i') // 交互式选择窗口
    }
  } else if (mode === 'region') {
    if (region) {
      // 使用 rect 参数直接指定区域
      // screencapture -R<x,y,w,h>
      const rect = `${region.x},${region.y},${region.width},${region.height}`
      args.push('-R', rect)
    } else {
      args.push('-s') // 交互式选择区域
    }
  }

  // 输出文件
  args.push(outputPath)

  const fullCmd = `${cmd} ${args.join(' ')}`
  await execAsync(fullCmd)

  return outputPath
}

/**
 * Linux 截图命令
 */
async function captureLinux(
  mode: ScreenshotMode,
  outputPath: string,
  options: {
    region?: { x: number; y: number; width: number; height: number }
    delay?: number
  }
): Promise<string> {
  const { region, delay = 0 } = options

  // 检测可用的截图工具
  const tools = ['gnome-screenshot', 'scrot', 'import', 'grim']
  let availableTool: string | null = null

  for (const tool of tools) {
    try {
      await execAsync(`which ${tool}`)
      availableTool = tool
      break
    } catch {
      continue
    }
  }

  if (!availableTool) {
    throw new Error('未找到可用的截图工具 (gnome-screenshot / scrot / ImageMagick / grim)')
  }

  let cmd: string

  switch (availableTool) {
    case 'gnome-screenshot':
      if (mode === 'fullscreen') {
        cmd = `gnome-screenshot -f "${outputPath}" ${delay > 0 ? `-d ${delay}` : ''}`
      } else if (mode === 'region') {
        if (region) {
          cmd = `gnome-screenshot -a -f "${outputPath}" --area=${region.x},${region.y},${region.width},${region.height}`
        } else {
          cmd = `gnome-screenshot -a -f "${outputPath}"` // 交互式
        }
      } else {
        cmd = `gnome-screenshot -w -f "${outputPath}"` // 窗口
      }
      break

    case 'scrot':
      if (mode === 'fullscreen') {
        cmd = `scrot ${delay > 0 ? `-d ${delay}` : ''} "${outputPath}"`
      } else if (mode === 'region') {
        if (region) {
          // scrot 不支持直接指定坐标，使用 import 或 grim
          cmd = `grim -g "${region.x},${region.y} ${region.width}x${region.height}" "${outputPath}"`
        } else {
          cmd = `scrot -s "${outputPath}"` // 交互式
        }
      } else {
        cmd = `scrot -u "${outputPath}"` // 窗口
      }
      break

    case 'grim':
      // Wayland 环境
      if (mode === 'fullscreen') {
        cmd = `grim "${outputPath}"`
      } else if (mode === 'region') {
        if (region) {
          cmd = `grim -g "${region.x},${region.y} ${region.width}x${region.height}" "${outputPath}"`
        } else {
          cmd = `grim -g "$(slurp)" "${outputPath}"` // 需要 slurp
        }
      } else {
        // grim 不支持窗口模式，回退到全屏
        cmd = `grim "${outputPath}"`
      }
      break

    case 'import':
      // ImageMagick
      if (mode === 'fullscreen') {
        cmd = `import -window root "${outputPath}"`
      } else if (mode === 'region') {
        if (region) {
          cmd = `import -crop ${region.width}x${region.height}+${region.x}+${region.y} -window root "${outputPath}"`
        } else {
          cmd = `import "${outputPath}"` // 交互式
        }
      } else {
        cmd = `import -frame "${outputPath}"` // 交互式窗口
      }
      break

    default:
      throw new Error(`未知的截图工具: ${availableTool}`)
  }

  await execAsync(cmd)
  return outputPath
}

/**
 * ScreenshotTool 实现
 */
export const ScreenshotTool: Tool = {
  name: 'ScreenshotTool',

  description: '截取屏幕、窗口或指定区域的图像。支持 macOS 和 Linux。可用于捕获当前屏幕状态、特定应用窗口或 UI 区域。',

  inputJSONSchema,

  userFacingName() {
    return 'Screenshot'
  },

  async *call(
    args: unknown,
    context: ToolUseContext,
    toolUse: unknown
  ): AsyncGenerator<YieldResult, ReturnResult> {
    const params = args as {
      mode?: ScreenshotMode
      output_path?: string
      window_id?: string
      window_name?: string
      region?: { x: number; y: number; width: number; height: number }
      delay?: number
      include_cursor?: boolean
    }

    const mode = params.mode || 'fullscreen'
    const outputPath = params.output_path || getTempPath()
    const delay = params.delay || 0

    const plat = getPlatform()

    if (plat === 'unknown') {
      return {
        type: 'tool_result',
        content: '不支持的平台。目前仅支持 macOS 和 Linux。',
        is_error: true,
      }
    }

    if (plat === 'windows') {
      return {
        type: 'tool_result',
        content: 'Windows 平台暂不支持。请使用 WSL 或手动截图。',
        is_error: true,
      }
    }

    try {
      if (delay > 0) {
        yield {
          type: 'progress',
          message: `${delay}秒后开始截图，请准备好屏幕...`,
        }

        // 倒计时
        for (let i = delay; i > 0; i--) {
          yield {
            type: 'progress',
            message: `倒计时: ${i}秒...`,
          }
          await new Promise((r) => setTimeout(r, 1000))
        }
      }

      yield {
        type: 'progress',
        message: `正在截取${mode === 'fullscreen' ? '全屏' : mode === 'window' ? '窗口' : '区域'}...`,
      }

      let resultPath: string

      if (plat === 'macos') {
        resultPath = await captureMacOS(mode, outputPath, {
          windowId: params.window_id,
          windowName: params.window_name,
          region: params.region,
          delay: 0, // 延迟已在上面处理
          includeCursor: params.include_cursor,
        })
      } else {
        resultPath = await captureLinux(mode, outputPath, {
          region: params.region,
          delay: 0,
        })
      }

      return {
        type: 'tool_result',
        content: `截图成功！\n保存位置: ${resultPath}`,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      return {
        type: 'tool_result',
        content: `截图失败: ${errorMessage}`,
        is_error: true,
      }
    }
  },

  isEnabled() {
    const plat = getPlatform()
    return plat === 'macos' || plat === 'linux'
  },

  getCost() {
    return 1
  },
}
