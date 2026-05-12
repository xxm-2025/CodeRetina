/**
 * VisionQATool —— 视觉问答工具
 *
 * 对图像提出问题，获取 VLM 回答。
 * 走 Hybrid Vision Router 自动选择模型。
 *
 * Sprint: S1-5
 */

import { randomUUID } from 'crypto'
import type { Tool, ToolInputJSONSchema, ToolUseContext } from '../../Tool.js'
import type { YieldResult, ReturnResult } from '../../Tool.js'
import { createSidecar } from '../../vision/sidecar.js'
import { VisionRouter } from '../../vision/router/router.js'

/**
 * VisionQATool 输入 Schema
 */
const inputSchema: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    image_path: {
      type: 'string',
      description: '图像文件的绝对路径',
    },
    question: {
      type: 'string',
      description: '要问的问题，例如 "这张图片里有什么？"',
    },
    preferred_tier: {
      type: 'string',
      enum: ['tier1', 'tier2', 'tier3'],
      description: '可选：指定模型层级（默认自动选择）',
    },
    max_tokens: {
      type: 'number',
      description: '最大输出 token 数（默认 256）',
    },
  },
  required: ['image_path', 'question'],
}

/**
 * VisionQATool 实现
 */
export const VisionQATool: Tool = {
  name: 'VisionQATool',

  description: '对图像进行视觉问答。可以问图像内容相关问题，如"这张图片里有什么？"、"图中有几个人？"等。支持自动模型选择和置信度输出。',

  inputJSONSchema,

  userFacingName() {
    return 'Vision QA'
  },

  async *call(
    args: unknown,
    context: ToolUseContext,
    toolUse: unknown
  ): AsyncGenerator<YieldResult, ReturnResult> {
    const params = args as {
      image_path: string
      question: string
      preferred_tier?: 'tier1' | 'tier2' | 'tier3'
      max_tokens?: number
    }

    // 参数校验
    if (!params.image_path) {
      return {
        type: 'tool_result',
        content: '错误: 缺少 image_path 参数',
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

    // 初始化 sidecar 和 router
    const sidecar = createSidecar()

    try {
      yield {
        type: 'progress',
        message: '正在连接 Vision Sidecar...',
      }

      await sidecar.start()

      const router = new VisionRouter(sidecar)

      yield {
        type: 'progress',
        message: '正在分析图像...',
      }

      // 执行视觉查询
      const response = await router.query({
        imagePath: params.image_path,
        prompt: params.question,
        preferredTier: params.preferred_tier,
        maxTokens: params.max_tokens ?? 256,
      })

      // 格式化输出
      const resultLines = [
        `回答: ${response.text}`,
        ``,
        `---`,
        `模型: ${response.model} (${response.tier})`,
        `置信度: ${(response.confidence * 100).toFixed(1)}%`,
        `延迟: ${response.latencyMs}ms`,
      ]

      if (response.tokens) {
        resultLines.push(`Tokens: ${response.tokens.input} in / ${response.tokens.output} out`)
      }

      if (response.cached) {
        resultLines.push(`缓存命中`)
      }

      // 添加预算信息
      const stats = router.getStats()
      resultLines.push(``, `会话成本: $${stats.sessionCost.toFixed(4)} / $${stats.budgetLimit.toFixed(2)}`)

      return {
        type: 'tool_result',
        content: resultLines.join('\n'),
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      return {
        type: 'tool_result',
        content: `视觉问答失败: ${errorMessage}`,
        is_error: true,
      }
    } finally {
      // 清理
      await sidecar.stop().catch(() => {})
    }
  },

  isEnabled() {
    return true
  },

  getCost() {
    return 2 // 相对较高成本
  },
}
