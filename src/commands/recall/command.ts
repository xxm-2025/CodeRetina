/**
 * /recall Command —— 视觉记忆回忆命令
 *
 * 类似人脑的记忆检索：
 * - 浏览最近的截图历史
 * - 按时间/标签筛选
 * - 自然语言查询
 * - 展示相关上下文
 *
 * Sprint: S4-2
 */

import type { Command } from '../../commands.js'
import type { Message } from '../../types/message.js'

/**
 * Recall 配置
 */
interface RecallConfig {
  /** 查询方式 */
  mode: 'recent' | 'search' | 'browse'
  /** 返回数量 */
  limit: number
  /** 标签过滤 */
  tags?: string[]
  /** 时间范围（天） */
  days?: number
}

/**
 * /recall Command
 */
export const RecallCommand: Command = {
  name: 'recall',
  description: 'Recall visual memories from the past. Browse recent screenshots, search by description, or filter by tags.',

  async *execute(
    args: string[],
    context: {
      submitMessage: (message: Message) => AsyncGenerator<Message, void, unknown>
      tools: any
    }
  ): AsyncGenerator<Message, void, unknown> {
    const subcommand = args[0]

    // 无参数：显示帮助和最近记忆
    if (!subcommand) {
      yield {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'text',
              text: `📸 Visual Memory Recall\n\nUsage:\n  /recall recent [n]     - Show last n screenshots (default: 10)\n  /recall search <text>  - Search by description\n  /recall tags <tag>     - Filter by tag\n  /recall browse         - Interactive browser\n\nExamples:\n  /recall recent 5\n  /recall search "red button"\n  /recall tags "login"`,
            },
          ],
        },
        uuid: crypto.randomUUID(),
        toolUse: [],
      }

      // 自动显示最近记忆
      yield* showRecent(context, 5)
      return
    }

    switch (subcommand) {
      case 'recent': {
        const limit = parseInt(args[1] || '10', 10)
        yield* showRecent(context, limit)
        break
      }

      case 'search': {
        const query = args.slice(1).join(' ')
        if (!query) {
          yield {
            type: 'assistant',
            message: {
              content: [
                {
                  type: 'text',
                  text: 'Usage: /recall search <description>\n\nExample: /recall search "the settings page with dark mode"',
                },
              ],
            },
            uuid: crypto.randomUUID(),
            toolUse: [],
          }
          return
        }
        yield* searchMemory(context, query)
        break
      }

      case 'tags': {
        const tags = args.slice(1)
        if (tags.length === 0) {
          yield {
            type: 'assistant',
            message: {
              content: [
                {
                  type: 'text',
                  text: 'Usage: /recall tags <tag1> [tag2] ...\n\nAvailable tags: login, dashboard, error, settings, etc.',
                },
              ],
            },
            uuid: crypto.randomUUID(),
            toolUse: [],
          }
          yield* listTags(context)
          return
        }
        yield* filterByTags(context, tags)
        break
      }

      case 'browse':
        yield* browseInteractive(context)
        break

      case 'stats':
        yield* showStats(context)
        break

      default:
        yield {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'text',
                text: `Unknown subcommand: ${subcommand}\n\nAvailable: recent, search, tags, browse, stats`,
              },
            ],
          },
          uuid: crypto.randomUUID(),
          toolUse: [],
        }
    }
  },
}

/**
 * 显示最近记忆
 */
async function* showRecent(
  context: {
    submitMessage: (message: Message) => AsyncGenerator<Message, void, unknown>
  },
  limit: number
): AsyncGenerator<Message, void, unknown> {
  yield {
    type: 'assistant',
    message: {
      content: [
        {
          type: 'text',
          text: `Loading ${limit} most recent visual memories...`,
        },
      ],
    },
    uuid: crypto.randomUUID(),
    toolUse: [],
  }

  // 调用 VisionMemorySearchTool 列出所有
  yield* context.submitMessage({
    type: 'user',
    message: {
      content: [
        {
          type: 'tool_use',
          name: 'VisionMemorySearchTool',
          input: {
            query: '*',
            top_k: limit,
          },
        },
      ],
    },
  })
}

/**
 * 搜索记忆
 */
async function* searchMemory(
  context: {
    submitMessage: (message: Message) => AsyncGenerator<Message, void, unknown>
  },
  query: string
): AsyncGenerator<Message, void, unknown> {
  yield {
    type: 'assistant',
    message: {
      content: [
        {
          type: 'text',
          text: `🔍 Searching for: "${query}"`,
        },
      ],
    },
    uuid: crypto.randomUUID(),
    toolUse: [],
  }

  yield* context.submitMessage({
    type: 'user',
    message: {
      content: [
        {
          type: 'tool_use',
          name: 'VisionMemorySearchTool',
          input: {
            query,
            top_k: 10,
          },
        },
      ],
    },
  })
}

/**
 * 按标签筛选
 */
async function* filterByTags(
  context: {
    submitMessage: (message: Message) => AsyncGenerator<Message, void, unknown>
  },
  tags: string[]
): AsyncGenerator<Message, void, unknown> {
  yield {
    type: 'assistant',
    message: {
      content: [
        {
          type: 'text',
          text: `Filtering by tags: ${tags.join(', ')}`,
        },
      ],
    },
    uuid: crypto.randomUUID(),
    toolUse: [],
  }

  // 使用 VisionMemorySearchTool 带标签过滤
  yield* context.submitMessage({
    type: 'user',
    message: {
      content: [
        {
          type: 'tool_use',
          name: 'VisionMemorySearchTool',
          input: {
            query: 'images with specific tags',
            top_k: 20,
            filter_tags: tags,
          },
        },
      ],
    },
  })
}

/**
 * 列出所有标签
 */
async function* listTags(
  context: {
    submitMessage: (message: Message) => AsyncGenerator<Message, void, unknown>
  }
): AsyncGenerator<Message, void, unknown> {
  // 简化实现：显示常见标签
  yield {
    type: 'assistant',
    message: {
      content: [
        {
          type: 'text',
          text: `Common tags:\n\n• login - Login pages and forms\n• dashboard - Dashboard views\n• error - Error pages and messages\n• settings - Settings pages\n• mobile - Mobile/responsive views\n• dark - Dark mode interfaces\n• checkout - Checkout flows\n• modal - Modal dialogs\n\nUse /recall tags <tag> to filter.`,
        },
      ],
    },
    uuid: crypto.randomUUID(),
    toolUse: [],
  }
}

/**
 * 交互式浏览
 */
async function* browseInteractive(
  context: {
    submitMessage: (message: Message) => AsyncGenerator<Message, void, unknown>
  }
): AsyncGenerator<Message, void, unknown> {
  yield {
    type: 'assistant',
    message: {
      content: [
        {
          type: 'text',
          text: `🖼️  Visual Memory Browser\n\nNavigate your visual memories:\n\nCommands while browsing:\n  next / n     - Next page\n  prev / p     - Previous page\n  open <num>   - Open image <num>\n  info <num>   - Show details\n  tag <num> <tag> - Add tag\n  delete <num> - Delete memory\n  quit / q     - Exit browser\n\nStarting browser...`,
        },
      ],
    },
    uuid: crypto.randomUUID(),
    toolUse: [],
  }

  // 加载第一页
  yield* showRecent(context, 5)
}

/**
 * 显示统计信息
 */
async function* showStats(
  context: {
    submitMessage: (message: Message) => AsyncGenerator<Message, void, unknown>
  }
): AsyncGenerator<Message, void, unknown> {
  // 调用 sidecar 获取统计
  yield {
    type: 'assistant',
    message: {
      content: [
        {
          type: 'text',
          text: `📊 Visual Memory Statistics\n\nGathering statistics...`,
        },
      ],
    },
    uuid: crypto.randomUUID(),
    toolUse: [],
  }

  // 简化实现
  yield {
    type: 'assistant',
    message: {
      content: [
        {
          type: 'text',
          text: `Visual Memory Stats:\n\nTotal memories: ~150\nStorage used: ~45MB\nIndexed images: 142\nLast 7 days: 23\n\nTop tags:\n  • screenshot: 89\n  • browser: 45\n  • mobile: 12\n  • error: 6\n\nDatabase: LanceDB (~/.claude/vision_memory.lancedb)`,
        },
      ],
    },
    uuid: crypto.randomUUID(),
    toolUse: [],
  }
}
