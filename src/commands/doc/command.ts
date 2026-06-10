/**
 * /doc Command —— 多模态文档 RAG
 *
 * 支持 PDF/HTML/Markdown 的索引和问答：
 * - /doc index <path> — 索引文档
 * - /doc ask "<question>" — 查询文档
 * - /doc list — 列出已索引文档
 *
 * Sprint: S7-C6
 */

import type { Command } from '../../commands.js'
import type { Message } from '../../types/message.js'

export const DocCommand: Command = {
  name: 'doc',
  description: 'Multi-modal document RAG. Index PDF/HTML/Markdown documents and perform cross-modal retrieval.',

  async *execute(
    args: string[],
    context: {
      submitMessage: (message: Message) => AsyncGenerator<Message, void, unknown>
      tools: any
    }
  ): AsyncGenerator<Message, void, unknown> {
    const subcommand = args[0]

    // =========================================================================
    // /doc index <path>
    // =========================================================================
    if (subcommand === 'index') {
      const path = args[1]
      if (!path) {
        yield {
          type: 'assistant',
          message: {
            content: [{
              type: 'text',
              text: '❌ 请提供文档路径: /doc index <path-or-url>',
            }],
          },
          uuid: crypto.randomUUID(),
          toolUse: [],
        }
        return
      }

      yield* indexDocument(path, context)
      return
    }

    // =========================================================================
    // /doc ask "<question>"
    // =========================================================================
    if (subcommand === 'ask') {
      const question = args.slice(1).join(' ')
      if (!question) {
        yield {
          type: 'assistant',
          message: {
            content: [{
              type: 'text',
              text: '❌ 请提供问题: /doc ask "<question>"',
            }],
          },
          uuid: crypto.randomUUID(),
          toolUse: [],
        }
        return
      }

      yield* askDocument(question, context)
      return
    }

    // =========================================================================
    // /doc list
    // =========================================================================
    if (subcommand === 'list') {
      yield* listDocuments(context)
      return
    }

    // =========================================================================
    // 帮助信息
    // =========================================================================
    yield {
      type: 'assistant',
      message: {
        content: [{
          type: 'text',
          text: `📄 Document RAG — 多模态文档检索

用法:
  /doc index <path-or-url>   索引 PDF/HTML/Markdown 文档
    --charts                 提取图表描述
    --tables                 提取表格描述

  /doc ask "<question>"      查询已索引的文档
    --doc-id <id>            限定特定文档
    --top-k <n>              返回结果数（默认 3）

  /doc list                  列出已索引的文档

示例:
  /doc index ./paper.pdf
  /doc index https://example.com/article.html
  /doc ask "Table 3 哪个 baseline 最差？"
  /doc ask "Figure 2 是什么架构？" --doc-id doc_abc123`,
        }],
      },
      uuid: crypto.randomUUID(),
      toolUse: [],
    }
  },
}

/**
 * 索引文档
 */
async function* indexDocument(
  path: string,
  context: {
    submitMessage: (message: Message) => AsyncGenerator<Message, void, unknown>
  }
): AsyncGenerator<Message, void, unknown> {
  yield {
    type: 'assistant',
    message: {
      content: [{
        type: 'text',
        text: `📂 开始索引文档: ${path}\n\n步骤: 解析 → 区域检测 → 描述生成 → Patch 嵌入 → 存储`,
      }],
    },
    uuid: crypto.randomUUID(),
    toolUse: [],
  }

  // 调用 DocRAGTool
  yield* context.submitMessage({
    type: 'user',
    message: {
      content: [{
        type: 'tool_use',
        name: 'DocRAGTool',
        input: {
          action: 'index',
          path: path,
          extract_charts: true,
          extract_tables: true,
        },
      }],
    },
  })
}

/**
 * 查询文档
 */
async function* askDocument(
  question: string,
  context: {
    submitMessage: (message: Message) => AsyncGenerator<Message, void, unknown>
  }
): AsyncGenerator<Message, void, unknown> {
  yield {
    type: 'assistant',
    message: {
      content: [{
        type: 'text',
        text: `🔍 查询: "${question}"\n\n使用 MaxSim late-interaction 检索...`,
      }],
    },
    uuid: crypto.randomUUID(),
    toolUse: [],
  }

  // 调用 DocRAGTool
  yield* context.submitMessage({
    type: 'user',
    message: {
      content: [{
        type: 'tool_use',
        name: 'DocRAGTool',
        input: {
          action: 'query',
          question: question,
          use_maxsim: true,
          top_k: 3,
        },
      }],
    },
  })
}

/**
 * 列出文档
 */
async function* listDocuments(context: {
  submitMessage: (message: Message) => AsyncGenerator<Message, void, unknown>
}): AsyncGenerator<Message, void, unknown> {
  yield {
    type: 'assistant',
    message: {
      content: [{
        type: 'text',
        text: '📋 已索引的文档列表\n\n（功能待实现：从 LanceDB 查询 doc_region 类型的记录）',
      }],
    },
    uuid: crypto.randomUUID(),
    toolUse: [],
  }
}
