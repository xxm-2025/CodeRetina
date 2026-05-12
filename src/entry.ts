/**
 * Claude Code Vision —— 极简入口
 *
 * 目的: 替代原 main.tsx，提供不依赖已删除模块的最小可运行 CLI
 * 功能: 仅挂载核心 Tool (Bash/File/Grep/Web 等)，验证 tool-call 循环正常
 *
 * Sprint: S0-4
 * 创建日期: 2026-05-12
 */

import { QueryEngine } from './QueryEngine.js'
import { getAllBaseTools } from './tools.js'
import { getCommands } from './commands.js'
import type { QueryEngineConfig } from './QueryEngine.js'
import type { Message } from './types/message.js'
import { createFileStateCache } from './utils/fileStateCache.js'

// 简化版的 AppState，仅保留 QueryEngine 所需字段
interface SimpleAppState {
  messages: Message[]
  isLoading: boolean
}

/**
 * 创建最小化的 QueryEngine 配置
 */
function createMinimalConfig(): QueryEngineConfig {
  const tools = getAllBaseTools()
  const commands = getCommands()
  const readFileCache = createFileStateCache()

  // 简化的权限检查函数（允许所有工具）
  const canUseTool = () => ({ allowed: true, reason: null })

  // 简化的 AppState 管理
  let appState: SimpleAppState = {
    messages: [],
    isLoading: false,
  }

  const config: QueryEngineConfig = {
    cwd: process.cwd(),
    tools,
    commands,
    mcpClients: [],
    agents: [],
    canUseTool,
    getAppState: () => appState as any,
    setAppState: (fn) => {
      appState = fn(appState as any) as any
    },
    readFileCache,
    maxTurns: 50,
  }

  return config
}

/**
 * 极简 CLI 主循环
 */
async function main() {
  console.log('🎨 Claude Code Vision — Minimal Entry')
  console.log('=====================================\n')

  const config = createMinimalConfig()
  const engine = new QueryEngine(config)

  // 从命令行参数获取初始消息，或进入交互模式
  const initialMessage = process.argv.slice(2).join(' ')

  if (initialMessage) {
    // 单轮模式：执行传入的命令后退出
    console.log(`User: ${initialMessage}\n`)
    await runSingleTurn(engine, initialMessage)
  } else {
    // 交互模式：持续读取 stdin
    console.log('进入交互模式（输入 "exit" 退出）:\n')
    await runInteractiveMode(engine)
  }

  console.log('\n👋 Goodbye!')
  process.exit(0)
}

/**
 * 单轮执行
 */
async function runSingleTurn(engine: QueryEngine, message: string) {
  try {
    for await (const event of engine.submitMessage({
      type: 'user',
      message: {
        content: [{ type: 'text', text: message }],
      },
    })) {
      handleEvent(event)
    }
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

/**
 * 交互模式
 */
async function runInteractiveMode(engine: QueryEngine) {
  const { createInterface } = require('readline')

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  })

  rl.prompt()

  for await (const line of rl) {
    const input = line.trim()

    if (input.toLowerCase() === 'exit') {
      rl.close()
      return
    }

    if (input) {
      console.log('')
      try {
        for await (const event of engine.submitMessage({
          type: 'user',
          message: {
            content: [{ type: 'text', text: input }],
          },
        })) {
          handleEvent(event)
        }
      } catch (error) {
        console.error('Error:', error)
      }
      console.log('')
    }

    rl.prompt()
  }
}

/**
 * 处理 QueryEngine 事件
 */
function handleEvent(event: any) {
  if (!event) return

  switch (event.type) {
    case 'assistant':
      // 处理助手消息
      if (event.message?.content) {
        for (const block of event.message.content) {
          if (block.type === 'text') {
            console.log(`Claude: ${block.text}`)
          } else if (block.type === 'tool_use') {
            console.log(`🔧 Using tool: ${block.name}`)
          }
        }
      }
      break

    case 'user':
      // 处理用户消息（通常是 tool_result）
      if (event.toolUseResult) {
        // 简化展示 tool 结果
        const preview =
          typeof event.toolUseResult === 'string'
            ? event.toolUseResult.slice(0, 200)
            : JSON.stringify(event.toolUseResult).slice(0, 200)
        console.log(`📊 Tool result: ${preview}...`)
      }
      break

    case 'progress':
      // 处理进度消息
      if (event.message) {
        console.log(`⏳ ${event.message}`)
      }
      break

    case 'system':
      // 系统消息
      if (event.message?.content) {
        console.log(`ℹ️  ${event.message.content}`)
      }
      break

    default:
      // 忽略其他类型
      break
  }
}

// 运行入口
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}

export { main, createMinimalConfig }
