/**
 * VideoQATool —— 视频问答工具
 *
 * 对录制好的屏幕视频进行问答，支持：
 * - 直接 QA：对整段视频提问
 * - Chapter 检索：先找相关 chapter 再 QA
 * - 时间范围：限定时间段查询
 *
 * Sprint: S6-B6
 */

import type { Tool, ToolInputJSONSchema, ToolUseContext } from '../../Tool.js'
import type { YieldResult, ReturnResult } from '../../Tool.js'
import { createSidecar } from '../../vision/sidecar.js'

const inputSchema: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    video_path: {
      type: 'string',
      description: '视频文件路径（绝对路径）',
    },
    question: {
      type: 'string',
      description: '要问的问题，例如 "刚才那个错误是什么？"',
    },
    frames: {
      type: 'number',
      description: '采样帧数（默认 16）',
    },
    start_time: {
      type: 'number',
      description: '开始时间（秒，可选）',
    },
    end_time: {
      type: 'number',
      description: '结束时间（秒，可选）',
    },
    use_chapters: {
      type: 'boolean',
      description: '是否使用 chapter 检索优化（默认 true）',
    },
  },
  required: ['video_path', 'question'],
}

export const VideoQATool: Tool = {
  name: 'VideoQATool',
  description: '对录制的屏幕视频进行问答。可以询问视频内容，如"刚才那个错误是什么？"、"我做了什么操作？"。支持自动 chapter 检索和时间范围限定。',
  inputJSONSchema: inputSchema,

  userFacingName() {
    return 'Video QA'
  },

  async *call(
    args: unknown,
    _context: ToolUseContext,
    _toolUse: unknown
  ): AsyncGenerator<YieldResult, ReturnResult> {
    const params = args as {
      video_path: string
      question: string
      frames?: number
      start_time?: number
      end_time?: number
      use_chapters?: boolean
    }

    if (!params.video_path) {
      return {
        type: 'tool_result',
        content: '错误: 缺少 video_path 参数',
        is_error: true,
      }
    }

    if (!params.question) {
      return {
        type: 'tool_result',
        content: '错误: 缺少 question 参数',
        is_error: true,
      }
    }

    const sidecar = createSidecar()

    try {
      yield { type: 'progress', message: '连接 Vision Sidecar...' }
      await sidecar.start()

      // 如果使用 chapter 检索
      let relevantFrames: Array<{ path: string; timestamp: number }> | undefined

      if (params.use_chapters !== false) {
        yield { type: 'progress', message: '检索相关 chapters...' }

        // 从 video_path 提取 session_id
        const sessionId = extractSessionId(params.video_path)

        const chapterResult = await sidecar.call<{
          success: boolean
          chapters?: Array<{
            image_path: string
            text: string
            start_time?: number
            _similarity?: number
          }>
          error?: string
        }>('rag.search_video_chapters', {
          query: params.question,
          session_id: sessionId,
          top_k: 3,
        })

        if (chapterResult.success && chapterResult.chapters && chapterResult.chapters.length > 0) {
          relevantFrames = chapterResult.chapters.map((c, idx) => ({
            path: c.image_path,
            timestamp: c.start_time || idx * 60,
          }))
        }
      }

      yield { type: 'progress', message: '分析视频内容...' }

      // 构建时间范围
      const timeRange: [number, number] | undefined =
        params.start_time !== undefined && params.end_time !== undefined
          ? [params.start_time, params.end_time]
          : relevantFrames && relevantFrames.length > 0
            ? [
                Math.max(0, relevantFrames[0].timestamp - 30),
                relevantFrames[relevantFrames.length - 1].timestamp + 30,
              ]
            : undefined

      // 执行视频 QA
      const result = await sidecar.call<{
        answer: string
        confidence: number
        relevant_frames: Array<{ path: string; timestamp: number }>
        latency_ms: number
        model: string
      }>('video.qa', {
        video_path: params.video_path,
        prompt: params.question,
        frames: params.frames || 16,
        time_range: timeRange,
      })

      const lines = [
        `📹 视频问答结果`,
        ``,
        `问题: ${params.question}`,
        ``,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `${result.answer}`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        ``,
        `置信度: ${(result.confidence * 100).toFixed(1)}%`,
        `延迟: ${result.latency_ms}ms`,
        `模型: ${result.model}`,
      ]

      if (relevantFrames && relevantFrames.length > 0) {
        lines.push('', `📍 相关时间点: ${relevantFrames.map((f) => `${f.timestamp.toFixed(0)}s`).join(', ')}`)
      }

      return {
        type: 'tool_result',
        content: lines.join('\n'),
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        type: 'tool_result',
        content: `视频问答失败: ${errorMessage}`,
        is_error: true,
      }
    } finally {
      await sidecar.stop().catch(() => {})
    }
  },

  isEnabled() {
    return true
  },

  getCost() {
    return 3
  },
}

/**
 * 从视频路径提取 session ID
 */
function extractSessionId(videoPath: string): string | undefined {
  // 文件名格式: {session_id}_{timestamp}.mp4
  const match = videoPath.match(/([a-f0-9-]+)_\d{4}-\d{2}-\d{2}/)
  return match ? match[1] : undefined
}
