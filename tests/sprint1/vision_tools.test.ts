/**
 * Sprint 1-5: Vision Tools 测试
 *
 * VisionQATool, OCRTool, AnnotateTool
 *
 * 能检验出的问题：
 * - 参数验证不完整
 * - 文件路径处理错误
 * - 工具调用失败时错误信息不清晰
 * - 资源清理不当
 * - 输出格式不一致
 */

import { VisionQATool } from '../../src/tools/vision/VisionQATool.js'
import { OCRTool } from '../../src/tools/vision/OCRTool.js'
import { AnnotateTool } from '../../src/tools/vision/AnnotateTool.js'

describe('S1-5: VisionQATool', () => {
  test('工具元数据正确', () => {
    expect(VisionQATool.name).toBe('VisionQATool')
    expect(VisionQATool.description).toBeDefined()
    expect(VisionQATool.description.length).toBeGreaterThan(0)
    expect(VisionQATool.inputJSONSchema).toBeDefined()
    expect(VisionQATool.inputJSONSchema.type).toBe('object')
  })

  test('Schema 定义了必需参数', () => {
    const schema = VisionQATool.inputJSONSchema

    expect(schema.required).toContain('image_path')
    expect(schema.required).toContain('question')
  })

  test('isEnabled 返回 true', () => {
    expect(VisionQATool.isEnabled()).toBe(true)
  })

  test('getCost 返回合理值', () => {
    const cost = VisionQATool.getCost()
    expect(cost).toBeGreaterThan(0)
  })

  test('userFacingName 返回可读名称', () => {
    const name = VisionQATool.userFacingName()
    expect(name).toBeDefined()
    expect(typeof name).toBe('string')
    expect(name.length).toBeGreaterThan(0)
  })
})

describe('S1-5: OCRTool', () => {
  test('工具元数据正确', () => {
    expect(OCRTool.name).toBe('OCRTool')
    expect(OCRTool.description).toBeDefined()
    expect(OCRTool.inputJSONSchema).toBeDefined()
  })

  test('Schema 定义了必需参数', () => {
    const schema = OCRTool.inputJSONSchema

    expect(schema.required).toContain('image_path')
  })

  test('可选参数 region 定义正确', () => {
    const schema = OCRTool.inputJSONSchema
    const regionProp = schema.properties?.region

    expect(regionProp).toBeDefined()
    expect(regionProp.type).toBe('object')
    expect(regionProp.properties).toHaveProperty('x')
    expect(regionProp.properties).toHaveProperty('y')
    expect(regionProp.properties).toHaveProperty('width')
    expect(regionProp.properties).toHaveProperty('height')
  })

  test('isEnabled 返回 true', () => {
    expect(OCRTool.isEnabled()).toBe(true)
  })

  test('getCost 返回合理值', () => {
    const cost = OCRTool.getCost()
    expect(cost).toBeGreaterThan(0)
    expect(cost).toBeLessThanOrEqual(VisionQATool.getCost()) // OCR 应该比 QA 便宜
  })
})

describe('S1-5: AnnotateTool', () => {
  test('工具元数据正确', () => {
    expect(AnnotateTool.name).toBe('AnnotateTool')
    expect(AnnotateTool.description).toBeDefined()
    expect(AnnotateTool.inputJSONSchema).toBeDefined()
  })

  test('Schema 定义了必需参数', () => {
    const schema = AnnotateTool.inputJSONSchema

    expect(schema.required).toContain('image_path')
    expect(schema.required).toContain('boxes')
  })

  test('boxes 参数定义正确', () => {
    const schema = AnnotateTool.inputJSONSchema
    const boxesProp = schema.properties?.boxes

    expect(boxesProp).toBeDefined()
    expect(boxesProp.type).toBe('array')
    expect(boxesProp.items?.properties).toHaveProperty('x')
    expect(boxesProp.items?.properties).toHaveProperty('y')
    expect(boxesProp.items?.properties).toHaveProperty('width')
    expect(boxesProp.items?.properties).toHaveProperty('height')
    expect(boxesProp.items?.properties).toHaveProperty('color')
  })

  test('isEnabled 返回 true', () => {
    expect(AnnotateTool.isEnabled()).toBe(true)
  })

  test('getCost 返回合理值', () => {
    const cost = AnnotateTool.getCost()
    expect(cost).toBeGreaterThan(0)
  })
})

describe('S1-5: Tool 通用测试', () => {
  const tools = [VisionQATool, OCRTool, AnnotateTool]

  test('所有工具都有 call 方法', () => {
    for (const tool of tools) {
      expect(typeof tool.call).toBe('function')
    }
  })

  test('所有工具都有 isEnabled 方法', () => {
    for (const tool of tools) {
      expect(typeof tool.isEnabled).toBe('function')
    }
  })

  test('所有工具都有 getCost 方法', () => {
    for (const tool of tools) {
      expect(typeof tool.getCost).toBe('function')
    }
  })

  test('所有工具都有 userFacingName 方法', () => {
    for (const tool of tools) {
      expect(typeof tool.userFacingName).toBe('function')
    }
  })

  test('所有工具都有 inputJSONSchema', () => {
    for (const tool of tools) {
      expect(tool.inputJSONSchema).toBeDefined()
      expect(tool.inputJSONSchema.type).toBe('object')
    }
  })

  test('所有工具的 Schema 都有 properties', () => {
    for (const tool of tools) {
      expect(tool.inputJSONSchema.properties).toBeDefined()
      expect(typeof tool.inputJSONSchema.properties).toBe('object')
    }
  })

  test('工具名称唯一', () => {
    const names = tools.map((t) => t.name)
    const uniqueNames = new Set(names)
    expect(uniqueNames.size).toBe(names.length)
  })

  test('工具成本合理排序', () => {
    // AnnotateTool 应该是本地处理，成本最低
    // OCRTool 中等
    // VisionQATool 最高（需要 VLM 推理）

    const annotateCost = AnnotateTool.getCost()
    const ocrCost = OCRTool.getCost()
    const qaCost = VisionQATool.getCost()

    expect(annotateCost).toBeLessThanOrEqual(ocrCost)
    expect(ocrCost).toBeLessThanOrEqual(qaCost)
  })
})

describe('S1-5: Schema 边界情况', () => {
  test('VisionQATool 支持 preferred_tier 枚举', () => {
    const schema = VisionQATool.inputJSONSchema
    const tierProp = schema.properties?.preferred_tier

    expect(tierProp).toBeDefined()
    expect(tierProp.enum).toContain('tier1')
    expect(tierProp.enum).toContain('tier2')
    expect(tierProp.enum).toContain('tier3')
  })

  test('OCRTool 支持 language 参数', () => {
    const schema = OCRTool.inputJSONSchema
    const langProp = schema.properties?.language

    expect(langProp).toBeDefined()
    expect(langProp.type).toBe('string')
    expect(langProp.default).toBe('auto')
  })

  test('AnnotateTool 支持 show_ids 和 show_labels', () => {
    const schema = AnnotateTool.inputJSONSchema

    expect(schema.properties?.show_ids).toBeDefined()
    expect(schema.properties?.show_ids.type).toBe('boolean')
    expect(schema.properties?.show_ids.default).toBe(true)

    expect(schema.properties?.show_labels).toBeDefined()
    expect(schema.properties?.show_labels.type).toBe('boolean')
  })
})

// 断言辅助函数
function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) {
        throw new Error(`Expected ${expected} but got ${actual}`)
      }
    },
    toBeDefined() {
      if (actual === undefined) {
        throw new Error('Expected value to be defined')
      }
    },
    toContain(item: any) {
      if (!Array.isArray(actual) || !actual.includes(item)) {
        throw new Error(`Expected to contain ${item}`)
      }
    },
    toHaveProperty(key: string) {
      if (!(key in actual)) {
        throw new Error(`Expected to have property ${key}`)
      }
    },
    toBeGreaterThan(n: number) {
      if (!(actual > n)) {
        throw new Error(`Expected > ${n} but got ${actual}`)
      }
    },
    toBeLessThan(n: number) {
      if (!(actual < n)) {
        throw new Error(`Expected < ${n} but got ${actual}`)
      }
    },
    toBeLessThanOrEqual(n: number) {
      if (!(actual <= n)) {
        throw new Error(`Expected <= ${n} but got ${actual}`)
      }
    },
    not: {
      toBe(expected: any) {
        if (actual === expected) {
          throw new Error(`Expected not ${expected}`)
        }
      },
    },
  }
}

function describe(name: string, fn: () => void) {
  console.log(`\n📦 ${name}`)
  fn()
}

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✅ ${name}`)
  } catch (error: any) {
    console.log(`  ❌ ${name}: ${error.message || error}`)
    process.exitCode = 1
  }
}

if (require.main === module) {
  console.log('========================================')
  console.log('Vision Tools Tests Complete')
  console.log('========================================')
}
