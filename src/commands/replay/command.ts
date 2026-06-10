/**
 * /replay Command —— 视频回放与检索
 *
 * 对录制的屏幕 session 进行回放、搜索和问答：
 * - /replay --list: 列出所有 session
 * - /replay 5min: 回放最近 5 分钟
 * - /replay "刚才的错误": 搜索并回答
 *
 * Sprint: S6-B6
 */

import type { Command } from '../../commands.js'
import type { Message } from '../../types/message.js'
import { sessionRecorder } from '../../services/sessionRecorder.js'
import { createSidecar } from '../../vision/sidecar.js'

export const ReplayCommand: Command = {
  name: 'replay',
  description: 'Replay and search recorded screen sessions. List sessions, query video content, or review specific time ranges.',

  async *execute(
    args: string[],
    context: {
      submitMessage: (message: Message) => AsyncGenerator<Message, void, unknown>
      tools: any
    }
  ): AsyncGenerator<Message, void, unknown> {
    const subcommand = args[0]
    const sidecar = createSidecar()

    // =========================================================================
    // /replay --list: 列出所有 session
    // =========================================================================
    if (subcommand === '--list' || subcommand === '-l') {
      yield* listSessions(context)
      return
    }

    // =========================================================================
    // /replay <duration>: 回放最近 N 分钟
    // e.g., /replay 5min, /replay 10m
    // =========================================================================
    if (/^\d+min?$|^\d+m$/i.test(subcommand || '')) {
      const minutes = parseInt(subcommand!.replace(/[^0-9]/g, ''), 10)
      yield* replayRecent(minutes, context, sidecar)
      return
    }

    // =========================================================================
    // /replay "<query>": 搜索视频内容
    // e.g., /replay "刚才那个报错"
    // =========================================================================
    const query = args.join(' ').trim()

    if (!query) {
      yield {
        type: 'assistant',
        message: {
          content: [{
            type: 'text',
            text: `📼 Replay — 视频回放与检索

用法:
  /replay --list          列出所有录制的 session
  /replay 5min            回放最近 5 分钟
  /replay 10m             回放最近 10 分钟
  /replay "刚才的错误"     搜索并回答视频内容
  /replay "what changed"  询问视频中的活动

需要配合 /live 命令的录制功能使用。
录制文件保存在: ~/.claude/sessions/`,
          }],
        },
        uuid: crypto.randomUUID(),
        toolUse: [],
      }
      return
    }

    yield* searchAndAnswer(query, context, sidecar)
  },
}

/**
 * 列出所有 session
 */
async function* listSessions(context: {
  submitMessage: (message: Message) => AsyncGenerator<Message, void, unknown>
}): AsyncGenerator<Message, void, unknown> {
  yield {
    type: 'assistant',
    message: {
      content: [{
        type: 'text',
        text: '📂 正在列出所有录制的 sessions...',
      }],
    },
    uuid: crypto.randomUUID(),
    toolUse: [],
  }

  // 使用 video.list_sessions
  const sidecar = createSidecar()

  try {
    await sidecar.start()

    const result = await sidecar.call<{
      sessions: Array<{
        id: string
        video_path: string
        filename: string
        created: string
        duration_sec: number
        size_mb: number
      }>
      total: number
    }>('video.list_sessions', {})

    if (result.total === 0) {
      yield {
        type: 'assistant',
        message: {
          content: [{
            type: 'text',
            text: '📭 暂无录制记录。\n\n使用 "/live" 开始录制屏幕。',
          }],
        },
        uuid: crypto.randomUUID(),
        toolUse: [],
      }
      return
    }

    const lines = [
      `📼 录制记录 (${result.total} 个)`,
      '',
      'ID | 时长 | 大小 | 创建时间',
      '---|------|------|----------',
    ]

    for (const session of result.sessions.slice(0, 10)) {
      const duration = formatDuration(session.duration_sec)
      const size = `${session.size_mb.toFixed(1)} MB`
      const created = session.created.slice(0, 19).replace('T', ' ')
      lines.push(`${session.id.slice(0, 8)}... | ${duration} | ${size} | ${created}`)
    }

    lines.push(
      '',
      '使用 "/replay <时长>" 查看最近的录制',
      '使用 "/replay <问题>" 搜索视频内容'
    )

    yield {
      type: 'assistant',
      message: {
        content: [{
          type: 'text',
          text: lines.join('\n'),
        }],
      },
      uuid: crypto.randomUUID(),
      toolUse: [],
    }

    await sidecar.stop()
  } catch (error) {
    yield {
      type: 'assistant',
      message: {
        content: [{
          type: 'text',
          text: `❌ 获取 session 列表失败: ${error instanceof Error ? error.message : String(error)}`,
        }],
      },
      uuid: crypto.randomUUID(),
      toolUse: [],
    }
  }
}

/**
 * 回放最近 N 分钟
 */
async function* replayRecent(
  minutes: number,
  context: {
    submitMessage: (message: Message) => AsyncGenerator<Message, void, unknown>
  },
  sidecar: ReturnType<typeof createSidecar>
): AsyncGenerator<Message, void, unknown> {
  yield {
    type: 'assistant',
    message: {
      content: [{
        type: 'text',
        text: `🔄 正在加载最近 ${minutes} 分钟的录制...`,
      }],
    },
    uuid: crypto.randomUUID(),
    toolUse: [],
  }

  try {
    await sidecar.start()

    // 获取最新的 session
    const listResult = await sidecar.call<{
      sessions: Array<{ video_path: string; duration_sec: number }>
    }>('video.list_sessions', {})

    if (!listResult.sessions || listResult.sessions.length === 0) {
      yield {
        type: 'assistant',
        message: {
          content: [{
            type: 'text',
            text: '📭 暂无录制记录。',
          }],
        },
        uuid: crypto.randomUUID(),
        toolUse: [],
      }
      return
    }

    const latestSession = listResult.sessions[0]

    // 抽取关键帧
    const keyframeResult = await sidecar.call<{
      keyframes: Array<{ path: string; timestamp: number; method: string }>
      total_scenes: number
    }>('video.extract_keyframes', {
      video_path: latestSession.video_path,
      max_frames: 8,
    })

    const frames = keyframeResult.keyframes || []

    // 生成时间线
    const lines = [
      `📼 最近 ${minutes} 分钟回放`,
      `视频: ${latestSession.video_path.split('/').pop()}`,
      ``,
      '📍 关键帧时间线:',
      '',
    ]

    for (const frame of frames) {
      const time = formatTime(frame.timestamp)
      lines.push(`  [${time}] ${frame.path.split('/').pop()}`)
    }

    lines.push(
      '',
      '使用 "/replay <问题>" 询问具体视频内容',
    )

    yield {
      type: 'assistant',
      message: {
        content: [{
          type: 'text',
          text: lines.join('\n'),
        }],
      },
      uuid: crypto.randomUUID(),
      toolUse: [],
    }

    await sidecar.stop()
  } catch (error) {
    yield {
      type: 'assistant',
      message: {
        content: [{
          type: 'text',
          text: `❌ 回放失败: ${error instanceof Error ? error.message : String(error)}`,
        }],
      },
      uuid: crypto.randomUUID(),
      toolUse: [],
    }
  }
}

/**
 * 搜索并回答问题
 */
async function* searchAndAnswer(
  query: string,
  context: {
    submitMessage: (message: Message) => AsyncGenerator<Message, void, unknown>
  },
  sidecar: ReturnType<typeof createSidecar>
): AsyncGenerator<Message, void, unknown> {
  yield {
    type: 'assistant',
    message: {
      content: [{
        type: 'text',
        text: `🔍 正在搜索: "${query}"`,
      }],
    },
    uuid: crypto.randomUUID(),
    toolUse: [],
  }

  // 使用 VideoQATool
  yield* context.submitMessage({
    type: 'user',
    message: {
      content: [{
        type: 'tool_use',
        name: 'VideoQATool',
        input: {
          video_path: 'latest', // VideoQATool 会自动找到最新视频
          question: query,
          use_chapters: true,
        },
      }],
    },
  })
}

/**
 * 格式化时长
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)

  if (mins > 0) {
    return `${mins}m ${secs}s`
  }
  return `${secs}s`
}

/**
 * 格式化时间戳
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}
