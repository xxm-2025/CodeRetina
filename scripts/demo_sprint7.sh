#!/bin/bash
#
# Sprint 7 — 方向 C (Multi-modal RAG / Document) Demo 脚本
#
# 演示:
# 1. 文档解析 (doc.parse)
# 2. 区域检测 (chart_table.detect_regions)
# 3. 图表/表格描述 (describe_chart, describe_table)
# 4. Patch 嵌入 (embed.colqwen2)
# 5. MaxSim 检索 (rag.search_with_maxsim)
# 6. 文档 QA (rag.query_document)
#

set -e

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║     Sprint 7 — 方向 C: Multi-modal RAG / Document              ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# 检查 Python 环境
echo "📋 检查 Python 环境..."
cd "$(dirname "$0")/../vision_sidecar"
python3 -c "
import sys
sys.path.insert(0, '.')
from vision_sidecar.methods import doc, chart_table, embed, rag
print('✓ doc module import OK')
print('✓ chart_table module import OK')
print('✓ embed module import OK')
print('✓ rag module import OK')
"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 1: doc.parse (文档解析)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

python3 << 'EOF'
import asyncio
import sys
sys.path.insert(0, '.')

from vision_sidecar.methods import doc

async def test_parse():
    # 创建一个模拟 PDF 路径
    result = await doc.parse(
        path="test_output/mock_paper.pdf",
        output_dir="test_output/doc_parsed",
        extract_tables=True,
        extract_figures=True,
    )
    
    print(f"文档解析完成:")
    metadata = result.get('metadata', {})
    print(f"  标题: {metadata.get('title', 'N/A')}")
    print(f"  页数: {len(result.get('pages', []))}")
    print(f"  输出目录: {result.get('output_dir', 'N/A')}")
    print(f"  延迟: {result.get('latency_ms', 0)}ms")
    print("")
    
    for p in result.get('pages', [])[:3]:
        print(f"  Page {p.get('page_idx', 0)}: {p.get('image_path', 'N/A')}")
    
    return result

result = asyncio.run(test_parse())
EOF

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 2: chart_table.detect_regions (区域检测)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

python3 << 'EOF'
import asyncio
import sys
sys.path.insert(0, '.')

from vision_sidecar.methods import chart_table

async def test_detect():
    # 使用刚才生成的页面
    page_path = "test_output/doc_parsed/page_001.png"
    
    result = await chart_table.detect_regions(page_path)
    
    print(f"区域检测结果:")
    print(f"  总区域数: {result.get('total', 0)}")
    print(f"  按类型: {result.get('by_kind', {})}")
    print("")
    
    for r in result.get('regions', [])[:5]:
        print(f"  [{r.get('label', 'N/A')}] {r.get('kind', 'N/A')} - 置信度: {r.get('confidence', 0):.2f}")
    
    # 保存裁剪后的区域
    cropped = await chart_table.crop_regions(
        page_path,
        result['regions'],
        "test_output/doc_regions",
    )
    print(f"\n裁剪完成: {len(cropped)} 个区域")
    
    return result

result = asyncio.run(test_detect())
EOF

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 3: describe_chart / describe_table (语义描述)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

python3 << 'EOF'
import asyncio
import sys
sys.path.insert(0, '.')

from vision_sidecar.methods import chart_table

async def test_descriptions():
    # 模拟图表
    chart_result = await chart_table.describe_chart(
        "test_output/doc_regions/chart_figure_000.png",
    )
    print("图表描述:")
    print(f"  类型: {chart_result.get('chart_type', 'N/A')}")
    print(f"  描述: {chart_result.get('caption', 'N/A')[:80]}...")
    print(f"  置信度: {chart_result.get('confidence', 0):.2f}")
    print("")
    
    # 模拟表格
    table_result = await chart_table.describe_table(
        "test_output/doc_regions/table_table_001.png",
    )
    print("表格描述:")
    print(f"  描述: {table_result.get('caption', 'N/A')[:80]}...")
    print(f"  行列: {table_result.get('row_count', 0)} x {table_result.get('col_count', 0)}")
    print(f"  表头: {table_result.get('headers', [])}")
    print(f"  置信度: {table_result.get('confidence', 0):.2f}")

asyncio.run(test_descriptions())
EOF

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 4: embed.colqwen2 (Patch 嵌入)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

python3 << 'EOF'
import asyncio
import sys
sys.path.insert(0, '.')

from vision_sidecar.methods import embed

async def test_colqwen2():
    result = await embed.colqwen2(
        image_path="test_output/doc_parsed/page_001.png",
        mode="patches",
    )
    
    print("ColQwen2 Patch 嵌入结果:")
    print(f"  Patch 数量: {result['num_patches']}")
    print(f"  Patch 形状: {result['patch_shape']}")
    print(f"  每 Patch 维度: {result['dimensions']}")
    print(f"  延迟: {result.get('latency_ms', 0)}ms")
    
    # 显示前3个patch的前5维
    if result.get('embeddings'):
        print(f"\n  第一个 patch 嵌入 (前5维): {result['embeddings'][0][:5]}")

asyncio.run(test_colqwen2())
EOF

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 5: 完整页面分析 + 存储到 RAG"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

python3 << 'EOF'
import asyncio
import sys
sys.path.insert(0, '.')

from vision_sidecar.methods import chart_table, embed, rag

async def test_full_pipeline():
    page_path = "test_output/doc_parsed/page_001.png"
    
    # 完整页面分析
    result = await chart_table.analyze_document_page(
        page_path,
        output_dir="test_output/doc_analyzed",
        generate_captions=True,
    )
    
    print("完整页面分析:")
    print(f"  总区域: {result.get('total_regions', 0)}")
    print(f"  图表: {len(result.get('charts', []))}")
    print(f"  表格: {len(result.get('tables', []))}")
    print(f"  文本块: {len(result.get('text_blocks', []))}")
    print(f"  延迟: {result.get('latency_ms', 0)}ms")
    
    # 存储一个图表区域到 RAG
    charts = result.get('charts', [])
    if charts:
        chart = charts[0]
        
        # 生成 patch embeddings
        embed_result = await embed.colqwen2(chart.get('path', ''), mode="patches")
        
        # 存储到 RAG
        store_result = await rag.store_document_region(
            doc_id="paper_colpali",
            page_idx=0,
            region_kind="chart",
            image_path=chart.get('path', ''),
            caption=chart.get('caption', 'Chart'),
            patch_embeddings=embed_result.get('embeddings'),
            source_path="test_output/mock_paper.pdf",
        )
        
        print(f"\n图表存储到 RAG: {store_result.get('success', False)}")
        if store_result.get('success'):
            print(f"  记录 ID: {store_result.get('record_id', 'N/A')[:8]}...")
    
    # 存储一个表格区域
    tables = result.get('tables', [])
    if tables:
        table = tables[0]
        embed_result = await embed.colqwen2(table.get('path', ''), mode="patches")
        
        store_result = await rag.store_document_region(
            doc_id="paper_colpali",
            page_idx=0,
            region_kind="table",
            image_path=table.get('path', ''),
            caption=table.get('caption', 'Table'),
            patch_embeddings=embed_result.get('embeddings'),
            source_path="test_output/mock_paper.pdf",
        )
        
        print(f"表格存储到 RAG: {store_result.get('success', False)}")

asyncio.run(test_full_pipeline())
EOF

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 6: MaxSim 检索 + 文档 QA"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

python3 << 'EOF'
import asyncio
import sys
sys.path.insert(0, '.')

from vision_sidecar.methods import rag

async def test_maxsim():
    # 使用 MaxSim 检索
    print("MaxSim 检索测试:")
    result = await rag.search_with_maxsim(
        query_text="model performance comparison",
        doc_filter=None,
        top_k=3,
    )
    
    if result.get('success'):
        print(f"  候选数: {result.get('total_candidates', 0)}")
        print(f"  返回结果: {len(result.get('results', []))}")
        print(f"  延迟: {result.get('latency_ms', 0)}ms")
        print("")
        for r in result.get('results', []):
            print(f"  - Page {r['page_idx']} [{r['region_kind']}] 分数: {r['maxsim_score']:.3f}")
            print(f"    {r['text'][:60]}...")
    else:
        print(f"  错误: {result.get('error', 'unknown')}")

async def test_query():
    print("\n文档 QA 测试:")
    result = await rag.query_document(
        query="Which baseline has the lowest recall?",
        doc_id=None,
        top_k=3,
        use_maxsim=True,
    )
    
    print(f"  答案: {result.get('answer', 'N/A')[:100]}...")
    print(f"  检索方法: {result.get('retrieval_method', 'N/A')}")
    print(f"  延迟: {result.get('latency_ms', 0)}ms")

asyncio.run(test_maxsim())
asyncio.run(test_query())
EOF

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                       Demo 完成!                                  ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "实现的功能:"
echo "  ✓ doc.parse - 文档解析 (PDF/HTML/Markdown)"
echo "  ✓ doc.extract_regions - 区域提取"
echo "  ✓ chart_table.detect_regions - DocLayout-YOLO 区域检测"
echo "  ✓ chart_table.crop_regions - 区域裁剪"
echo "  ✓ chart_table.describe_chart - ChartGemma 图表描述"
echo "  ✓ chart_table.describe_table - Table-LLaVA 表格描述"
echo "  ✓ embed.colqwen2 - ColQwen2 patch 嵌入"
echo "  ✓ rag.store_document_region - 文档区域存储"
echo "  ✓ rag.search_with_maxsim - MaxSim late-interaction 检索"
echo "  ✓ rag.query_document - 文档 QA"
echo "  ✓ DocRAGTool - TypeScript 工具封装"
echo "  ✓ /doc command - CLI 命令"
echo ""
echo "CLI 命令示例:"
echo "  ./coderetina /doc index ./paper.pdf      # 索引 PDF"
echo "  ./coderetina /doc ask \"Table 3 results\"   # 查询表格"
echo "  ./coderetina /doc ask \"Figure 2 chart\"    # 查询图表"
echo ""
