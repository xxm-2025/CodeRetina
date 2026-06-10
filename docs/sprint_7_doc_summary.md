# Sprint 7 方向 C — Multi-modal RAG / Document 总结

**日期**: 2026-05-12  
**分支**: main  
**提交**: S7-C1 ~ S7-C7

## 目标

实现多模态文档 RAG，支持 PDF/HTML/Markdown 的索引和跨模态检索问答。

核心能力:
- 文档解析 → 区域检测 → 语义描述 → Patch 嵌入 → Late-interaction 检索

## 实现内容

### S7-C1: 文档解析 (doc.py)

- `doc.parse()`: 统一文档解析接口
  - PDF: PyMuPDF (备选 MinerU)
  - HTML: playwright 截图
  - Markdown: 直接渲染
- `doc.extract_regions()`: 区域裁剪
- 输出: `[{page_idx, image_path, kind, width, height}]`

### S7-C2: 区域检测 (chart_table.py)

- `detect_regions()`: DocLayout-YOLO 风格检测
  - 区域类型: title, text, header, footer, figure, table, chart
  - 返回: `[{bbox, label, confidence, kind}]`
- `crop_regions()`: 批量裁剪检测到的区域
- Mock 模式: 基于页面特征模拟检测结果

### S7-C3: 图表/表格描述 (chart_table.py)

- `describe_chart()`: ChartGemma 语义描述
  - 返回: `caption`, `chart_type`, `data_summary`, `confidence`
- `describe_table()`: Table-LLaVA 语义描述
  - 返回: `caption`, `structure`, `headers`, `sample_data`, `row/col_count`
- `analyze_document_page()`: 完整页面分析流水线

### S7-C4: Patch 嵌入 (embed.py)

- `ColQwen2Embedder` 类: 支持 patch-level 嵌入
- `colqwen2()`: RPC 方法
  - 输入: 图像路径
  - 输出: 1024 patches × 128 dims (典型值)
  - 模式: `patches` 或 `single` (平均池化)
- 保留 SigLIP2 作为 fallback

### S7-C5: Late-Interaction 检索 (rag.py)

- `search_with_maxsim()`: MaxSim 检索
  - 算法: query patch 与 doc patches 逐对 max，再 sum
  - 参考: ColPali/VisRAG late-interaction
- `store_document_region()`: 文档区域存储
  - 支持 `patch_embeddings` 字段
  - 标签: `["doc_region", "doc:<id>", "page:<idx>", "kind:<type>"]`
- `query_document()`: 文档 QA (检索 + VLM 生成)

### S7-C6: DocRAGTool + /doc 命令

- `DocRAGTool.ts`:
  - `action: index`: 完整索引流水线
    - 解析 → 检测 → 描述 → 嵌入 → 存储
  - `action: query`: MaxSim 检索问答
- `/doc command.ts`:
  - `/doc index <path>`: 索引文档
  - `/doc ask "<question>"`: 查询
  - `/doc list`: 列出文档

### S7-C7: Demo 脚本

- `demo_sprint7.sh`: 完整功能验证
  - 文档解析
  - 区域检测与裁剪
  - 图表/表格描述
  - Patch 嵌入
  - RAG 存储与检索
  - 文档 QA

## Demo 结果

```
测试 1: doc.parse
  标题: Mock Research Paper
  页数: 5
  延迟: ~2ms

测试 2: detect_regions
  总区域数: 5
  按类型: {'text': 4, 'table': 1}

测试 4: colqwen2
  Patch 数量: 1024
  形状: [32, 32]
  维度: 128
  延迟: 220ms

测试 5: analyze_document_page
  总区域: 5
  图表: 0
  表格: 1
  文本块: 4
  延迟: 14ms

测试 6: query_document
  检索方法: maxsim
  延迟: 231ms
```

## 文件变更

```
新增:
- vision_sidecar/methods/doc.py
- vision_sidecar/methods/chart_table.py
- src/tools/vision/DocRAGTool.ts
- src/commands/doc/command.ts
- scripts/demo_sprint7.sh
- docs/sprint_7_doc_summary.md

修改:
- vision_sidecar/methods/embed.py (+ColQwen2Embedder, +colqwen2)
- vision_sidecar/methods/rag.py (+MaxSim, +doc region support)
- vision_sidecar/methods/register_all.py (+doc, +chart_table, +rag methods)
```

## 技术架构

```
文档输入 (PDF/HTML/MD)
    ↓
doc.parse() → Page Images
    ↓
chart_table.detect_regions() → Regions (text/figure/chart/table)
    ↓
chart_table.analyze_document_page()
    ├─ describe_chart() → ChartGemma caption
    └─ describe_table() → Table-LLaVA caption
    ↓
embed.colqwen2() → Patch Embeddings [1024×128]
    ↓
rag.store_document_region() → LanceDB
    ↓
rag.query_document() / search_with_maxsim()
    ├─ MaxSim: query_patches × doc_patches → max → sum
    └─ Top-K retrieval
    ↓
Answer Generation
```

## Late-Interaction (MaxSim) 详解

```python
# 对于 query 的每个 patch
for q_patch in query_patches:
    max_sim = max(
        cosine_sim(q_patch, d_patch)
        for d_patch in doc_patches
    )
    total_sim += max_sim

final_score = total_sim / len(query_patches)
```

优势:
- 细粒度匹配 (patch-level)
- 比单向量检索更精准
- 支持变长文档

## CLI 用法

```bash
# 索引 PDF
./coderetina /doc index ./colpali_paper.pdf

# 查询表格
./coderetina /doc ask "Table 3 哪个 baseline 最差？"

# 查询图表
./coderetina /doc ask "Figure 2 是什么架构？"

# 限定特定文档
./coderetina /doc ask "实验结果" --doc-id doc_abc123
```

## 与方向 A/B 的对比

| 特性 | 方向 A: Agentic Search | 方向 B: Video Replay | 方向 C: Doc RAG |
|------|------------------------|---------------------|----------------|
| 输入 | 单张图像 | 视频序列 | 多页文档 |
| 核心 | crop/zoom 主动探索 | 关键帧+chapter | patch embedding+MaxSim |
| 存储 | Trace 图像 | mp4+chapters | Patch embeddings |
| 检索 | 无 | Chapter 向量 | Late-interaction MaxSim |
| 应用 | 小目标识别 | "刚才做了什么" | "第3页表格说了什么" |

## 参考论文/项目

- **ColPali** (Faysse et al., 2024) — Patch-level late-interaction
- **VisRAG** (OpenBMB 2024) — Vision-based RAG
- **MinerU** (Shanghai AI Lab 2024) — PDF parsing
- **DocLayout-YOLO** — Document region detection
- **ChartGemma** (Google 2024) — Chart understanding
- **Table-LLaVA** — Table understanding

## 下一步（可选）

1. **真实模型接入**: MinerU, DocLayout-YOLO, ChartGemma, Table-LLaVA, ColQwen2
2. **Schema 迁移**: LanceDB 正式支持 `patch_embeddings` 字段
3. **方向 D**: Visual Planning / WebDreamer (propose → simulate → select → execute)
