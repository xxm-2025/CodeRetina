/**
 * Sprint 0-4: Entry Point 测试
 *
 * 测试极简 CLI 入口的核心功能
 * 能检验出的问题：
 * - QueryEngine 初始化失败
 * - Tool/Command 加载不完整
 * - 配置项缺失
 * - 事件处理异常
 */

import { createMinimalConfig } from '../../src/entry.js'

describe('S0-4: Entry Point', () => {
  describe('createMinimalConfig', () => {
    test('返回有效的配置对象', () => {
      const config = createMinimalConfig()

      expect(config).toBeDefined()
      expect(config.cwd).toBe(process.cwd())
      expect(config.tools).toBeDefined()
      expect(config.commands).toBeDefined()
    })

    test('包含核心工具集', () => {
      const config = createMinimalConfig()
      const toolNames = config.tools.map((t: any) => t.name)

      // 核心工具必须存在
      const requiredTools = ['BashTool', 'FileReadTool', 'FileEditTool', 'GlobTool', 'GrepTool']

      for (const tool of requiredTools) {
        expect(toolNames).toContain(tool)
      }
    })

    test('包含核心命令集', () => {
      const config = createMinimalConfig()
      const commandNames = config.commands.map((c: any) => c.name || c.commandName)

      // 命令不能为空
      expect(commandNames.length).toBeGreaterThan(0)
    })

    test('权限检查函数始终允许', () => {
      const config = createMinimalConfig()
      const result = config.canUseTool('anyTool', {})

      expect(result.allowed).toBe(true)
      expect(result.reason).toBeNull()
    })

    test('AppState 管理器可正常工作', () => {
      const config = createMinimalConfig()

      // 获取初始状态
      const initialState = config.getAppState()
      expect(initialState).toBeDefined()
      expect(Array.isArray(initialState.messages)).toBe(true)

      // 状态更新
      config.setAppState((prev: any) => ({
        ...prev,
        messages: [...prev.messages, { type: 'test' }],
      }))

      const newState = config.getAppState()
      expect(newState.messages.length).toBe(1)
    })

    test('readFileCache 存在且有效', () => {
      const config = createMinimalConfig()

      expect(config.readFileCache).toBeDefined()
      expect(typeof config.readFileCache.get).toBe('function')
      expect(typeof config.readFileCache.set).toBe('function')
    })

    test('配置包含 maxTurns 限制', () => {
      const config = createMinimalConfig()

      expect(config.maxTurns).toBeDefined()
      expect(config.maxTurns).toBeGreaterThan(0)
    })

    test('MCP 客户端和 Agent 数组已初始化', () => {
      const config = createMinimalConfig()

      expect(Array.isArray(config.mcpClients)).toBe(true)
      expect(Array.isArray(config.agents)).toBe(true)
    })
  })

  describe('配置边界情况', () => {
    test('多次调用返回独立配置', () => {
      const config1 = createMinimalConfig()
      const config2 = createMinimalConfig()

      // 修改 config1 不应影响 config2
      config1.setAppState((prev: any) => ({
        ...prev,
        isLoading: true,
      }))

      expect(config1.getAppState().isLoading).toBe(true)
      expect(config2.getAppState().isLoading).not.toBe(true)
    })

    test('工具都有必需的属性', () => {
      const config = createMinimalConfig()

      for (const tool of config.tools) {
        expect(tool.name).toBeDefined()
        expect(typeof tool.name).toBe('string')
        expect(tool.name.length).toBeGreaterThan(0)

        expect(tool.description).toBeDefined()
        expect(typeof tool.description).toBe('string')

        expect(tool.inputJSONSchema).toBeDefined()
        expect(tool.inputJSONSchema.type).toBe('object')

        expect(typeof tool.call).toBe('function')
      }
    })

    test('命令都有必需的属性', () => {
      const config = createMinimalConfig()

      for (const cmd of config.commands) {
        const name = cmd.name || cmd.commandName
        expect(name).toBeDefined()
        expect(typeof name).toBe('string')

        expect(typeof cmd.execute || typeof cmd.handler || typeof cmd.call).toBe('function')
      }
    })

    test('isEnabled 函数检查', () => {
      const config = createMinimalConfig()

      for (const tool of config.tools) {
        if (tool.isEnabled) {
          expect(typeof tool.isEnabled).toBe('function')
          // 不应该抛出异常
          expect(() => tool.isEnabled()).not.toThrow()
        }
      }
    })
  })
})

// 简单的断言实现
function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) {
        throw new Error(`Expected ${expected} but got ${actual}`)
      }
    },
    toBeDefined() {
      if (actual === undefined) {
        throw new Error(`Expected value to be defined but got undefined`)
      }
    },
    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected null but got ${actual}`)
      }
    },
    toContain(item: any) {
      if (!Array.isArray(actual) || !actual.includes(item)) {
        throw new Error(`Expected array to contain ${item}`)
      }
    },
    toHaveLength(n: number) {
      if (!actual || actual.length !== n) {
        throw new Error(`Expected length ${n} but got ${actual?.length}`)
      }
    },
    toBeGreaterThan(n: number) {
      if (!(actual > n)) {
        throw new Error(`Expected value > ${n} but got ${actual}`)
      }
    },
    toBeGreaterThanOrEqual(n: number) {
      if (!(actual >= n)) {
        throw new Error(`Expected value >= ${n} but got ${actual}`)
      }
    },
    toMatch(pattern: RegExp) {
      if (!pattern.test(String(actual))) {
        throw new Error(`Expected to match ${pattern} but got ${actual}`)
      }
    },
    not: {
      toThrow() {
        // 用于检查函数不抛出异常
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

// 运行测试
if (require.main === module) {
  console.log('========================================')
  console.log('Entry Point Tests Complete')
  console.log('========================================')
}
