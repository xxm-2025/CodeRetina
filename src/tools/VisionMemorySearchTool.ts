/**
 * VisionMemorySearchTool —— 视觉记忆搜索工具
 *
 * 基于 SigLIP2 嵌入 + LanceDB 检索。
 * 支持自然语言查询找到相关图像。
 *
 * Sprint: S4-2
 */

import type { Tool, ToolInputJSONSchema, ToolUseContext } from '../Tool.js'
import type { YieldResult, ReturnResult } from '../Tool.js'
import { createSidecar } from '../vision/sidecar.js'

/**
 * VisionMemorySearchTool 输入 Schema
 */
const inputSchema: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: '搜索查询（自然语言描述要找的图像）',
    },
    top_k: {
      type: 'number',
      description: '返回结果数量（默认 5）',
      default: 5,
    },
    filter_tags: {
      type: 'array',
      items: { type: 'string' },
      description: '标签过滤（可选）',
    },
    include_similarity: {
      type: 'boolean',
      description: '是否包含相似度分数',
      default: true,
    },
  },
  required: ['query'],
}

/**
 * 视觉记忆搜索结果
 */
interface MemoryResult {
  id: string
  image_path: string
  text: string
  tags: string[]
  timestamp: number
  similarity: number
  source: string
}

/**
 * VisionMemorySearchTool 实现
 */
export const VisionMemorySearchTool: Tool = {
  name: 'VisionMemorySearchTool',

  description:
    'Search visual memory using natural language. Finds relevant images based on semantic similarity. Example: "find that red button from last week" or "screenshot of the login page"',

  inputJSONSchema,

  userFacingName() {
    return 'Visual Memory Search'
  },

  async *call(
    args: unknown,
    context: ToolUseContext,
    toolUse: unknown
  ): AsyncGenerator<YieldResult, ReturnResult> {
    const params = args as {
      query: string
      top_k?: number
      filter_tags?: string[]
      include_similarity?: boolean
    }

    if (!params.query) {
      return {
        type: 'tool_result',
        content: '错误: 需要提供 query 参数',
        is_error: true,
      }
    }

    const query = params.query
    const topK = params.top_k ?? 5

    const sidecar = createSidecar()

    try {
      yield {
        type: 'progress',
        message: `🔍 Searching visual memory for: "${query}"...`,
      }

      await sidecar.start()

      yield {
        type: 'progress',
        message: 'Embedding query and searching...',
      }

      // 调用 RAG 查询
      const searchResult = await sidecar.call<{
        success: boolean
        count: number
        results: MemoryResult[]
        error?: string
        latency_ms: number
      }>('rag.query', {
        query_text: query,
        top_k: topK,
        embed_first: true,
      })

      if (!searchResult.success) {
        return {
          type: 'tool_result',
          content: `搜索失败: ${searchResult.error || 'Unknown error'}`,
          is_error: true,
        }
      }

      if (searchResult.count === 0) {
        return {
          type: 'tool_result',
          content: [
            `未找到与 "${query}" 相关的视觉记忆`,
            ``,
            `建议:`,
            `- 尝试使用不同的关键词`,
            `- 检查是否有截图被正确索引`,
            `- 使用 /recall 命令浏览所有记忆`,
          ].join('\n'),
        }
      }

      // 格式化结果
      const lines: string[] = [
        `找到 ${searchResult.count} 个相关记忆:`,
        ``,
        `查询: "${query}"`,
        `延迟: ${searchResult.latency_ms}ms`,
        ``,
      ]

      for (let i = 0; i < searchResult.results.length; i++) {
        const r = searchResult.results[i]
        const date = new Date(r.timestamp * 1000).toLocaleString()

        lines.push(`--- Result ${i + 1} ---`)
        lines.push(`图像: ${r.image_path}`)
        if (params.include_similarity !== false) {
          lines.push(`相似度: ${(r.similarity * 100).toFixed(1)}%`)
        }
        if (r.text) {
          lines.push(`文本: ${r.text}`)
        }
        if (r.tags && r.tags.length > 0) {
          lines.push(`标签: ${r.tags.join(', ')}`)
        }
        lines.push(`时间: ${date}`)
        lines.push(`来源: ${r.source}`)
        lines.push('')
      }

      return {
        type: 'tool_result',
        content: lines.join('\n'),
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      return {
        type: 'tool_result',
        content: `视觉记忆搜索失败: ${errorMessage}`,
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
    return 2
  },
}
