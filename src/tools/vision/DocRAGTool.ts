/**
 * DocRAGTool —— 多模态文档 RAG 工具
 *
 * 支持 PDF/HTML/Markdown 的索引和问答：
 * - 文档解析（MinerU/PyMuPDF）
 * - 区域检测（DocLayout-YOLO）
 * - 图表/表格描述（ChartGemma/Table-LLaVA）
 * - Patch 嵌入（ColQwen2）
 * - Late-interaction 检索（MaxSim）
 *
 * Sprint: S7-C6
 */

import type { Tool, ToolInputJSONSchema, ToolUseContext } from '../../Tool.js'
import type { YieldResult, ReturnResult } from '../../Tool.js'
import { createSidecar } from '../../vision/sidecar.js'

const inputSchema: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['index', 'query'],
      description: '操作类型: index(索引文档) 或 query(查询)',
    },
    // index 参数
    path: {
      type: 'string',
      description: '文档路径 (PDF/HTML/MD) 或 URL，用于 index 操作',
    },
    doc_id: {
      type: 'string',
      description: '文档 ID（可选，默认自动生成）',
    },
    extract_charts: {
      type: 'boolean',
      description: '是否提取并描述图表（默认 true）',
    },
    extract_tables: {
      type: 'boolean',
      description: '是否提取并描述表格（默认 true）',
    },
    // query 参数
    question: {
      type: 'string',
      description: '查询问题，用于 query 操作',
    },
    filter_doc_id: {
      type: 'string',
      description: '限定查询的文档 ID',
    },
    top_k: {
      type: 'number',
      description: '返回结果数（默认 3）',
    },
    use_maxsim: {
      type: 'boolean',
      description: '是否使用 MaxSim 检索（默认 true）',
    },
  },
  required: ['action'],
}

export const DocRAGTool: Tool = {
  name: 'DocRAGTool',
  description: '多模态文档 RAG 工具。支持索引 PDF/HTML/Markdown 文档，并进行跨模态检索问答。自动提取图表、表格并生成语义描述。',
  inputJSONSchema: inputSchema,

  userFacingName() {
    return 'Document RAG'
  },

  async *call(
    args: unknown,
    _context: ToolUseContext,
    _toolUse: unknown
  ): AsyncGenerator<YieldResult, ReturnResult> {
    const params = args as {
      action: 'index' | 'query'
      path?: string
      doc_id?: string
      extract_charts?: boolean
      extract_tables?: boolean
      question?: string
      filter_doc_id?: string
      top_k?: number
      use_maxsim?: boolean
    }

    if (!params.action) {
      return {
        type: 'tool_result',
        content: '错误: 缺少 action 参数 (index 或 query)',
        is_error: true,
      }
    }

    const sidecar = createSidecar()

    try {
      yield { type: 'progress', message: '连接 Vision Sidecar...' }
      await sidecar.start()

      if (params.action === 'index') {
        return yield* indexDocument(params, sidecar)
      } else {
        return yield* queryDocument(params, sidecar)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        type: 'tool_result',
        content: `文档 RAG 失败: ${errorMessage}`,
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
    return 4
  },
}

/**
 * 索引文档
 */
async function* indexDocument(
  params: {
    path?: string
    doc_id?: string
    extract_charts?: boolean
    extract_tables?: boolean
  },
  sidecar: ReturnType<typeof createSidecar>
): AsyncGenerator<YieldResult, ReturnResult> {
  if (!params.path) {
    return {
      type: 'tool_result',
      content: '错误: 缺少 path 参数',
      is_error: true,
    }
  }

  yield { type: 'progress', message: `解析文档: ${params.path}...` }

  // 1. 解析文档
  const parseResult = await sidecar.call<{
    pages: Array<{
      page_idx: number
      image_path: string
      kind: string
      width: number
      height: number
    }>
    metadata: {
      title: string
      num_pages: number
      format: string
    }
    output_dir: string
    latency_ms: number
  }>('doc.parse', {
    path: params.path,
    extract_tables: params.extract_tables !== false,
    extract_figures: params.extract_charts !== false,
  })

  const pages = parseResult.pages || []
  const docId = params.doc_id || generateDocId(params.path)

  yield {
    type: 'progress',
    message: `文档解析完成: ${pages.length} 页，开始区域检测...`,
  }

  // 2. 每页进行区域检测和分析
  let totalRegions = 0
  let charts = 0
  let tables = 0

  for (const page of pages) {
    // 分析页面（检测区域 + 生成描述）
    const analysisResult = await sidecar.call<{
      regions: Array<{ kind: string; label: string }>
      charts: Array<{ path: string; caption: string }>
      tables: Array<{ path: string; caption: string; headers: string[] }>
      latency_ms: number
    }>('chart_table.analyze_document_page', {
      page_path: page.image_path,
      output_dir: `${parseResult.output_dir}/regions_page_${page.page_idx}`,
      generate_captions: true,
    })

    totalRegions += analysisResult.regions?.length || 0
    charts += analysisResult.charts?.length || 0
    tables += analysisResult.tables?.length || 0

    // 3. 存储每个区域到 RAG
    for (const region of analysisResult.charts || []) {
      // 生成 patch embeddings
      const embedResult = await sidecar.call<{
        embeddings: number[][]
        num_patches: number
      }>('embed.colqwen2', {
        image_path: region.path,
        mode: 'patches',
      })

      await sidecar.call('rag.store_document_region', {
        doc_id: docId,
        page_idx: page.page_idx,
        region_kind: 'chart',
        image_path: region.path,
        caption: region.caption,
        patch_embeddings: embedResult.embeddings,
        source_path: params.path,
        metadata: {
          chart_type: region.chart_type,
        },
      })
    }

    for (const region of analysisResult.tables || []) {
      const embedResult = await sidecar.call<{
        embeddings: number[][]
        num_patches: number
      }>('embed.colqwen2', {
        image_path: region.path,
        mode: 'patches',
      })

      await sidecar.call('rag.store_document_region', {
        doc_id: docId,
        page_idx: page.page_idx,
        region_kind: 'table',
        image_path: region.path,
        caption: region.caption,
        patch_embeddings: embedResult.embeddings,
        source_path: params.path,
        metadata: {
          headers: region.headers,
          row_count: region.row_count,
        },
      })
    }

    // 存储文本块
    for (const region of analysisResult.regions || []) {
      if (region.kind === 'text') {
        const embedResult = await sidecar.call<{
          embeddings: number[][]
        }>('embed.colqwen2', {
          image_path: page.image_path, // 整页嵌入
          mode: 'patches',
        })

        await sidecar.call('rag.store_document_region', {
          doc_id: docId,
          page_idx: page.page_idx,
          region_kind: 'text',
          image_path: page.image_path,
          caption: `Page ${page.page_idx} text region`,
          patch_embeddings: embedResult.embeddings,
          source_path: params.path,
        })
      }
    }
  }

  const lines = [
    `📄 文档索引完成`,
    ``,
    `文档 ID: ${docId}`,
    `标题: ${parseResult.metadata?.title || 'Unknown'}`,
    `页数: ${pages.length}`,
    ``,
    `提取内容:`,
    `  - 总区域: ${totalRegions}`,
    `  - 图表: ${charts}`,
    `  - 表格: ${tables}`,
    ``,
    `存储位置: ${parseResult.output_dir}`,
    ``,
    `💡 现在可以使用 query 操作查询此文档。`,
  ]

  return {
    type: 'tool_result',
    content: lines.join('\n'),
  }
}

/**
 * 查询文档
 */
async function* queryDocument(
  params: {
    question?: string
    filter_doc_id?: string
    top_k?: number
    use_maxsim?: boolean
  },
  sidecar: ReturnType<typeof createSidecar>
): AsyncGenerator<YieldResult, ReturnResult> {
  if (!params.question) {
    return {
      type: 'tool_result',
      content: '错误: 缺少 question 参数',
      is_error: true,
    }
  }

  yield { type: 'progress', message: `检索: "${params.question}"...` }

  const queryResult = await sidecar.call<{
    answer: string
    sources: Array<{
      doc_id: string
      page_idx: number
      region_kind: string
      image_path: string
      text: string
      maxsim_score: number
    }>
    retrieval_method: string
    latency_ms: number
  }>('rag.query_document', {
    query: params.question,
    doc_id: params.filter_doc_id,
    top_k: params.top_k || 3,
    use_maxsim: params.use_maxsim !== false,
  })

  const lines = [
    `📖 文档问答结果`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `${queryResult.answer}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `📍 参考来源:`,
  ]

  for (const source of queryResult.sources || []) {
    lines.push(
      `  • Page ${source.page_idx} [${source.region_kind}] - 相似度: ${(source.maxsim_score * 100).toFixed(1)}%`
    )
    if (source.text) {
      lines.push(`    ${source.text.substring(0, 80)}...`)
    }
  }

  lines.push(
    ``,
    `检索方法: ${queryResult.retrieval_method}`,
    `延迟: ${queryResult.latency_ms}ms`,
  )

  return {
    type: 'tool_result',
    content: lines.join('\n'),
  }
}

/**
 * 生成文档 ID
 */
function generateDocId(path: string): string {
  const crypto = require('crypto')
  const hash = crypto.createHash('md5').update(path).digest('hex')
  return `doc_${hash.substring(0, 8)}`
}
