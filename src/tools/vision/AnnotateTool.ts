/**
 * AnnotateTool —— 图像标注工具
 *
 * 在图像上绘制边界框、编号、文字等。
 * 用于 Set-of-Mark (SoM) prompting。
 *
 * Sprint: S1-5
 */

import type { Tool, ToolInputJSONSchema, ToolUseContext } from '../../Tool.js'
import type { YieldResult, ReturnResult } from '../../Tool.js'

/**
 * 标注框
 */
interface AnnotationBox {
  /** 编号 */
  id?: string
  /** 左上角 x */
  x: number
  /** 左上角 y */
  y: number
  /** 宽度 */
  width: number
  /** 高度 */
  height: number
  /** 标签 */
  label?: string
  /** 颜色 (hex 或名称) */
  color?: string
}

/**
 * AnnotateTool 输入 Schema
 */
const inputSchema: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    image_path: {
      type: 'string',
      description: '输入图像路径',
    },
    output_path: {
      type: 'string',
      description: '输出图像路径（默认覆盖原图）',
    },
    boxes: {
      type: 'array',
      description: '要绘制的边界框列表',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '编号' },
          x: { type: 'number', description: '左上角 x' },
          y: { type: 'number', description: '左上角 y' },
          width: { type: 'number', description: '宽度' },
          height: { type: 'number', description: '高度' },
          label: { type: 'string', description: '标签文本' },
          color: { type: 'string', description: '颜色 (hex 或名称)', default: 'red' },
        },
        required: ['x', 'y', 'width', 'height'],
      },
    },
    show_ids: {
      type: 'boolean',
      description: '是否显示编号（SoM 模式）',
      default: true,
    },
    show_labels: {
      type: 'boolean',
      description: '是否显示标签',
      default: true,
    },
  },
  required: ['image_path', 'boxes'],
}

/**
 * AnnotateTool 实现
 *
 * 使用 Sharp (Node.js) 或 Python Pillow 进行图像绘制。
 * 当前版本通过 sidecar 调用 Python 实现。
 */
export const AnnotateTool: Tool = {
  name: 'AnnotateTool',

  description: '在图像上绘制边界框、编号和标签。用于视觉标注和 Set-of-Mark (SoM) prompting。',

  inputJSONSchema,

  userFacingName() {
    return 'Annotate Image'
  },

  async *call(
    args: unknown,
    context: ToolUseContext,
    toolUse: unknown
  ): AsyncGenerator<YieldResult, ReturnResult> {
    const params = args as {
      image_path: string
      output_path?: string
      boxes: AnnotationBox[]
      show_ids?: boolean
      show_labels?: boolean
    }

    if (!params.image_path) {
      return {
        type: 'tool_result',
        content: '错误: 缺少 image_path 参数',
        is_error: true,
      }
    }

    if (!params.boxes || params.boxes.length === 0) {
      return {
        type: 'tool_result',
        content: '错误: boxes 不能为空',
        is_error: true,
      }
    }

    // 默认输出路径
    const outputPath = params.output_path || params.image_path.replace(/\.png$/i, '_annotated.png')

    try {
      yield {
        type: 'progress',
        message: '正在处理图像标注...',
      }

      // Sprint 1: 简化实现，直接调用 sidecar 的 image.annotate 方法
      // 注意：需要先在 Python sidecar 实现该方法

      // 临时方案：使用 Sharp 本地处理（如果有 sharp 依赖）
      // 否则返回说明

      try {
        const sharp = require('sharp')

        // 使用 Sharp 进行标注
        const image = sharp(params.image_path)
        const metadata = await image.metadata()
        const { width = 800, height = 600 } = metadata

        // 创建 SVG overlay
        const svgElements: string[] = []
        let colorIndex = 0
        const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF']

        for (const box of params.boxes) {
          const color = box.color || colors[colorIndex % colors.length]
          colorIndex++

          // 绘制矩形
          svgElements.push(
            `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" ` +
              `fill="none" stroke="${color}" stroke-width="2" />`
          )

          // 绘制编号标签
          const label = box.id || (params.show_labels ? box.label : null)
          if (label) {
            const labelY = box.y > 20 ? box.y - 5 : box.y + box.height + 15
            svgElements.push(
              `<rect x="${box.x}" y="${labelY - 12}" width="${label.length * 8 + 8}" height="16" ` +
                `fill="${color}" stroke="none" />`,
              `<text x="${box.x + 4}" y="${labelY}" fill="white" font-size="12" font-family="Arial">${label}</text>`
            )
          }
        }

        const svg = `<svg width="${width}" height="${height}">${svgElements.join('')}</svg>`

        await image
          .composite([
            {
              input: Buffer.from(svg),
              top: 0,
              left: 0,
            },
          ])
          .toFile(outputPath)

        return {
          type: 'tool_result',
          content: `标注完成。\n输出文件: ${outputPath}\n标注了 ${params.boxes.length} 个区域。`,
        }
      } catch (sharpError) {
        // Sharp 不可用，返回说明
        return {
          type: 'tool_result',
          content: [
            `标注配置已生成（Sharp 不可用，需手动标注或安装 sharp 依赖）:`,
            ``,
            `输入图像: ${params.image_path}`,
            `建议输出: ${outputPath}`,
            ``,
            `标注区域:`,
            ...params.boxes.map(
              (box, i) =>
                `  ${i + 1}. ${box.label || '未命名'}: (${box.x}, ${box.y}, ${box.width}, ${box.height})`
            ),
          ].join('\n'),
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      return {
        type: 'tool_result',
        content: `标注失败: ${errorMessage}`,
        is_error: true,
      }
    }
  },

  isEnabled() {
    return true
  },

  getCost() {
    return 1
  },
}
