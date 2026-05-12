/**
 * OCRTool —— 光学字符识别工具
 *
 * 从图像中提取文字。
 * Sprint 1 使用 VLM 的 OCR 能力，Sprint 2 可集成专用 OCR（PaddleOCR）
 *
 * Sprint: S1-5
 */

import type { Tool, ToolInputJSONSchema, ToolUseContext } from '../../Tool.js'
import type { YieldResult, ReturnResult } from '../../Tool.js'
import { createSidecar } from '../../vision/sidecar.js'

/**
 * OCRTool 输入 Schema
 */
const inputSchema: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    image_path: {
      type: 'string',
      description: '图像文件的绝对路径',
    },
    region: {
      type: 'object',
      description: '可选：指定区域 (x, y, width, height)',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
      },
    },
    language: {
      type: 'string',
      description: '语言代码（默认 auto）',
      default: 'auto',
    },
  },
  required: ['image_path'],
}

/**
 * OCRTool 实现
 *
 * Sprint 1: 使用 VLM 的 OCR 能力（通过 vlm.caption + 特定 prompt）
 * Sprint 2: 迁移到专用 OCR 后端（PaddleOCR）
 */
export const OCRTool: Tool = {
  name: 'OCRTool',

  description: '从图像中提取文字。支持全图 OCR 或指定区域 OCR。',

  inputJSONSchema,

  userFacingName() {
    return 'OCR'
  },

  async *call(
    args: unknown,
    context: ToolUseContext,
    toolUse: unknown
  ): AsyncGenerator<YieldResult, ReturnResult> {
    const params = args as {
      image_path: string
      region?: { x: number; y: number; width: number; height: number }
      language?: string
    }

    if (!params.image_path) {
      return {
        type: 'tool_result',
        content: '错误: 缺少 image_path 参数',
        is_error: true,
      }
    }

    const sidecar = createSidecar()

    try {
      yield {
        type: 'progress',
        message: '正在连接 Vision Sidecar...',
      }

      await sidecar.start()

      yield {
        type: 'progress',
        message: '正在识别文字...',
      }

      // Sprint 1: 使用 VLM 的 query 方法，通过特定 prompt 实现 OCR
      // 后续可替换为专用 OCR 方法
      const ocrPrompt = params.region
        ? `Extract and transcribe all text visible in the region at coordinates (${params.region.x}, ${params.region.y}, ${params.region.width}, ${params.region.height}). Return only the text content.`
        : 'Extract and transcribe all text visible in this image. Return only the text content, preserving line breaks.'

      const result = await sidecar.call<{
        answer: string
        confidence: number
        latency_ms: number
      }>('vlm.query', {
        image_path: params.image_path,
        question: ocrPrompt,
        model: 'moondream2',  // OCR 用轻量模型即可
      })

      const resultLines = [
        `识别结果:`,
        result.answer,
        ``,
        `---`,
        `置信度: ${(result.confidence * 100).toFixed(1)}%`,
        `延迟: ${result.latency_ms}ms`,
      ]

      return {
        type: 'tool_result',
        content: resultLines.join('\n'),
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      return {
        type: 'tool_result',
        content: `OCR 失败: ${errorMessage}`,
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
    return 1
  },
}
