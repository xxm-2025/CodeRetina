/**
 * UIParseTool —— UI 解析工具
 *
 * 将屏幕截图解析为结构化的 UI 元素树。
 * 基于 OmniParser v2 或 YOLO + VLM 组合。
 *
 * Sprint: S2-4
 */

import { createSidecar } from '../../vision/sidecar.js'
import type { Tool, ToolInputJSONSchema, ToolUseContext } from '../../Tool.js'
import type { YieldResult, ReturnResult } from '../../Tool.js'

/**
 * UI 元素类型
 */
type UIElementType =
  | 'button'
  | 'text'
  | 'input'
  | 'image'
  | 'link'
  | 'checkbox'
  | 'radio'
  | 'dropdown'
  | 'slider'
  | 'icon'
  | 'container'
  | 'unknown'

/**
 * UI 元素
 */
interface UIElement {
  id: string
  type: UIElementType
  text?: string
  bounds: {
    x: number
    y: number
    width: number
    height: number
  }
  confidence: number
  attributes?: {
    [key: string]: string | boolean | number
  }
  children?: UIElement[]
}

/**
 * UIParseTool 输入 Schema
 */
const inputSchema: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    image_path: {
      type: 'string',
      description: '屏幕截图路径',
    },
    backend: {
      type: 'string',
      enum: ['omniparser', 'yolo', 'vlm', 'hybrid'],
      description: '解析后端：omniparser/YOLO/VLM/hybrid',
      default: 'hybrid',
    },
    include_text: {
      type: 'boolean',
      description: '是否提取文字内容',
      default: true,
    },
    filter_types: {
      type: 'array',
      items: { type: 'string' },
      description: '要过滤的元素类型',
    },
    min_confidence: {
      type: 'number',
      description: '最小置信度阈值（0-1）',
      default: 0.5,
    },
  },
  required: ['image_path'],
}

/**
 * UIParseTool 实现
 *
 * 支持多种后端：
 * - omniparser: 专用 UI 解析模型（需要额外安装）
 * - yolo: 使用 YOLO 检测 UI 元素
 * - vlm: 使用视觉语言模型描述
 * - hybrid: 组合策略（YOLO + VLM）
 */
export const UIParseTool: Tool = {
  name: 'UIParseTool',

  description:
    '将屏幕截图解析为结构化的 UI 元素树。识别按钮、输入框、文本等交互元素及其位置。支持 OmniParser、YOLO 或 VLM 后端。',

  inputJSONSchema,

  userFacingName() {
    return 'UI Parse'
  },

  async *call(
    args: unknown,
    context: ToolUseContext,
    toolUse: unknown
  ): AsyncGenerator<YieldResult, ReturnResult> {
    const params = args as {
      image_path: string
      backend?: 'omniparser' | 'yolo' | 'vlm' | 'hybrid'
      include_text?: boolean
      filter_types?: string[]
      min_confidence?: number
    }

    if (!params.image_path) {
      return {
        type: 'tool_result',
        content: '错误: 缺少 image_path 参数',
        is_error: true,
      }
    }

    const backend = params.backend || 'hybrid'
    const minConfidence = params.min_confidence ?? 0.5

    const sidecar = createSidecar()

    try {
      yield {
        type: 'progress',
        message: `正在连接 Vision Sidecar (${backend} 后端)...`,
      }

      await sidecar.start()

      yield {
        type: 'progress',
        message: '正在解析 UI 元素...',
      }

      let elements: UIElement[] = []

      switch (backend) {
        case 'yolo':
        case 'hybrid': {
          // 使用 YOLO 检测 UI 相关元素
          const detectResult = (await sidecar.call('detect.yolo', {
            image_path: params.image_path,
            confidence: minConfidence,
          })) as {
            detections: Array<{
              class: string
              confidence: number
              box: { x1: number; y1: number; x2: number; y2: number }
            }>
          }

          elements = detectResult.detections.map((d, i) => ({
            id: `yolo-${i}`,
            type: this.mapYOLOClassToUIType(d.class),
            bounds: {
              x: Math.round(d.box.x1 * 1000), // 假设归一化坐标
              y: Math.round(d.box.y1 * 1000),
              width: Math.round((d.box.x2 - d.box.x1) * 1000),
              height: Math.round((d.box.y2 - d.box.y1) * 1000),
            },
            confidence: d.confidence,
          }))

          // hybrid 模式下，用 VLM 补充分析
          if (backend === 'hybrid' && params.include_text) {
            yield {
              type: 'progress',
              message: '正在提取文字内容...',
            }

            // 对每个检测到的区域进行 OCR
            for (const element of elements) {
              try {
                const ocrResult = (await sidecar.call('vlm.query', {
                  image_path: params.image_path,
                  question: `What text is in the region at (${element.bounds.x}, ${element.bounds.y}, ${element.bounds.width}, ${element.bounds.height})?`,
                })) as { answer: string; confidence: number }

                element.text = ocrResult.answer
              } catch {
                // 忽略 OCR 失败
              }
            }
          }
          break
        }

        case 'vlm': {
          // 纯 VLM 方案：让 VLM 描述 UI 布局
          const vlmResult = (await sidecar.call('vlm.query', {
            image_path: params.image_path,
            question:
              'Describe the UI elements in this screenshot. For each element, provide: type (button/text/input/image), approximate position (x,y), and any visible text.',
          })) as { answer: string }

          // 解析 VLM 输出（简化版，实际应该用结构化输出或 prompt engineering）
          elements = this.parseVLMOutput(vlmResult.answer)
          break
        }

        case 'omniparser': {
          // 使用 OmniParser v2
          const omniResult = (await sidecar.call('ui.parse', {
            image_path: params.image_path,
            include_text: params.include_text,
          })) as { elements: UIElement[] }

          elements = omniResult.elements
          break
        }
      }

      // 过滤
      if (params.filter_types) {
        elements = elements.filter((e) => params.filter_types?.includes(e.type))
      }

      // 过滤低置信度
      elements = elements.filter((e) => e.confidence >= minConfidence)

      // 生成报告
      const report = this.generateReport(elements, backend)

      await sidecar.stop()

      return {
        type: 'tool_result',
        content: report,
      }
    } catch (error) {
      await sidecar.stop().catch(() => {})

      const errorMessage = error instanceof Error ? error.message : String(error)

      return {
        type: 'tool_result',
        content: `UI 解析失败: ${errorMessage}`,
        is_error: true,
      }
    }
  },

  isEnabled() {
    return true
  },

  getCost() {
    return 3 // 较复杂
  },

  /**
   * 将 YOLO 类别映射到 UI 类型
   */
  private mapYOLOClassToUIClass(yoloClass: string): UIElementType {
    const mapping: Record<string, UIElementType> = {
      person: 'unknown',
      cell: 'input',
      phone: 'input',
      laptop: 'container',
      tv: 'container',
      mouse: 'icon',
      keyboard: 'input',
      remote: 'button',
      book: 'text',
    }

    return mapping[yoloClass] || 'unknown'
  },

  /**
   * 解析 VLM 输出为结构化元素
   */
  private parseVLMOutput(output: string): UIElement[] {
    // 简化实现：从 VLM 文本中提取元素
    // 实际应该用结构化 prompt 或 function calling
    const elements: UIElement[] = []

    // 尝试匹配 "Type: X at (y, y)" 格式的行
    const lines = output.split('\n')
    let idCounter = 0

    for (const line of lines) {
      const typeMatch = line.match(/(button|input|text|image|link)/i)
      const coordMatch = line.match(/\((\d+),\s*(\d+)\)/)

      if (typeMatch) {
        elements.push({
          id: `vlm-${idCounter++}`,
          type: typeMatch[1].toLowerCase() as UIElementType,
          bounds: {
            x: coordMatch ? parseInt(coordMatch[1]) : 0,
            y: coordMatch ? parseInt(coordMatch[2]) : 0,
            width: 100,
            height: 30,
          },
          confidence: 0.7,
        })
      }
    }

    return elements
  },

  /**
   * 生成可读报告
   */
  private generateReport(elements: UIElement[], backend: string): string {
    const lines: string[] = [
      `UI 解析报告 (${backend} 后端)`,
      ``,
      `发现 ${elements.length} 个 UI 元素:`,
      ``,
    ]

    // 按类型分组
    const byType: Record<string, UIElement[]> = {}
    for (const e of elements) {
      if (!byType[e.type]) byType[e.type] = []
      byType[e.type].push(e)
    }

    for (const [type, items] of Object.entries(byType)) {
      lines.push(`${type}: ${items.length} 个`)
      for (const item of items.slice(0, 5)) {
        // 只显示前5个
        const text = item.text ? ` "${item.text.slice(0, 30)}"` : ''
        lines.push(
          `  - ${item.id}: (${item.bounds.x}, ${item.bounds.y}, ${item.bounds.width}x${item.bounds.height})${text}`
        )
      }
      if (items.length > 5) {
        lines.push(`  ... 还有 ${items.length - 5} 个`)
      }
      lines.push('')
    }

    // JSON 输出（供程序使用）
    lines.push('--- JSON 格式 ---')
    lines.push(JSON.stringify(elements, null, 2))

    return lines.join('\n')
  },
}
