"""
文档解析 —— PDF / HTML / Markdown 结构化处理

功能:
- doc.parse: 解析文档为结构化数据
- doc.extract_pages: 提取页面为图像
- doc.get_metadata: 获取文档元数据

支持格式:
- PDF: 使用 MinerU (或备选 PyMuPDF)
- HTML: 使用 playwright 截图
- Markdown: 直接解析

输出统一格式: [{page_idx, image_path, kind, bbox, ocr_text, markdown}]

Sprint: S7-C1
"""

from __future__ import annotations

import logging
import os
import subprocess
import time
from pathlib import Path
from typing import Any

from PIL import Image

logger = logging.getLogger(__name__)

# 是否使用真实解析库
USE_REAL_PARSERS = False

# 可选导入
try:
    import fitz  # PyMuPDF
    HAS_FITZ = True
except ImportError:
    HAS_FITZ = False


def _mock_pdf_pages(pdf_path: str, output_dir: str) -> list[dict[str, Any]]:
    """Mock: 创建模拟的 PDF 页面"""
    pages = []
    num_pages = 5  # 模拟 5 页

    for i in range(num_pages):
        # 创建模拟页面图像
        img = Image.new('RGB', (800, 1100), color=(255, 255, 255))

        # 添加一些内容示意
        from PIL import ImageDraw, ImageFont
        draw = ImageDraw.Draw(img)

        try:
            font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 24)
            small_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 14)
        except:
            font = ImageFont.load_default()
            small_font = font

        # 标题
        draw.text((50, 50), f"Mock Research Paper - Page {i+1}", fill='#333333', font=font)

        # 内容区域
        y = 120
        colors = ['#1a1a2e', '#16213e', '#0f3460', '#e94560', '#533483']

        for para in range(3):
            # 模拟段落
            draw.rectangle([50, y, 750, y+80], fill='#f5f5f5', outline='#ddd')
            draw.text((60, y+10), f"Section {para+1} on page {i+1}", fill=colors[para % len(colors)], font=small_font)
            y += 100

        # 如果是第2页，添加一个模拟表格
        if i == 1:
            draw.rectangle([100, 500, 700, 700], fill='#f9f9f9', outline='#333')
            draw.text((300, 520), "Table 1: Results", fill='#333', font=font)
            for row in range(4):
                y_pos = 560 + row * 30
                draw.line([100, y_pos, 700, y_pos], fill='#ccc')
                draw.text((120, y_pos+5), f"Row {row+1}: Data...", fill='#666', font=small_font)

        # 如果是第3页，添加一个模拟图表
        if i == 2:
            # 模拟柱状图
            chart_colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f7dc6f', '#bb8fce']
            for j, color in enumerate(chart_colors):
                x_pos = 150 + j * 100
                height = 100 + j * 30
                draw.rectangle([x_pos, 600-height, x_pos+60, 600], fill=color)
            draw.text((300, 620), "Figure 2: Performance Chart", fill='#333', font=font)

        # 保存
        page_path = os.path.join(output_dir, f"page_{i+1:03d}.png")
        img.save(page_path, "PNG")

        pages.append({
            "page_idx": i,
            "image_path": page_path,
            "width": 800,
            "height": 1100,
            "kind": "page",
        })

    return pages


def _mock_markdown_content() -> str:
    """Mock: 生成模拟的 markdown 内容"""
    return """# Research Paper: Visual RAG Systems

## Abstract
This paper presents a novel approach to visual retrieval-augmented generation.

## Introduction
Visual RAG combines computer vision with large language models...

## Method
Our approach uses ColPali for patch-level embedding...

## Results
See Table 1 for performance comparison.

## Conclusion
The proposed method achieves state-of-the-art results.
"""


async def parse(
    path: str,
    output_dir: str | None = None,
    extract_tables: bool = True,
    extract_figures: bool = True,
) -> dict[str, Any]:
    """
    解析文档为结构化数据

    Args:
        path: 文档路径 (PDF/HTML/MD) 或 URL
        output_dir: 输出目录（默认文档同级目录）
        extract_tables: 是否提取表格
        extract_figures: 是否提取图表

    Returns:
        {
            "pages": [{page_idx, image_path, kind, bbox, ocr_text, markdown}],
            "metadata": {title, author, num_pages, ...},
            "structured_content": {tables: [...], figures: [...], text_blocks: [...]},
            "output_dir": str,
        }
    """
    start_time = time.time()

    # 确定文档类型
    ext = Path(path).suffix.lower()

    if output_dir is None:
        doc_dir = Path(path).parent
        doc_name = Path(path).stem
        output_dir = str(doc_dir / f"{doc_name}_parsed")
    os.makedirs(output_dir, exist_ok=True)
    
    # 检查文件是否存在（PDF/HTML/MD）
    if not os.path.exists(path) and ext != '.pdf':
        return {
            "error": f"File not found: {path}",
            "pages": [],
        }

    logger.info(f"[parse] path={path}, type={ext}, output={output_dir}")

    if ext == '.pdf':
        result = await _parse_pdf(path, output_dir, extract_tables, extract_figures)
    elif ext in ['.html', '.htm']:
        result = await _parse_html(path, output_dir)
    elif ext in ['.md', '.markdown']:
        result = await _parse_markdown(path, output_dir)
    else:
        return {
            "error": f"Unsupported file type: {ext}",
            "pages": [],
        }

    result["latency_ms"] = int((time.time() - start_time) * 1000)
    result["source_path"] = path

    return result


async def _parse_pdf(
    pdf_path: str,
    output_dir: str,
    extract_tables: bool,
    extract_figures: bool,
) -> dict[str, Any]:
    """解析 PDF"""

    if not USE_REAL_PARSERS or not HAS_FITZ:
        # Mock 实现
        logger.info("[parse_pdf] Using mock implementation")

        pages = _mock_pdf_pages(pdf_path, output_dir)

        # 结构化内容
        structured = {
            "tables": [],
            "figures": [],
            "text_blocks": [],
        }

        if extract_tables:
            structured["tables"].append({
                "page": 1,
                "label": "Table 1",
                "caption": "Performance comparison of different models",
                "bbox": [100, 500, 700, 700],
            })

        if extract_figures:
            structured["figures"].append({
                "page": 2,
                "label": "Figure 2",
                "caption": "Performance Chart showing accuracy vs speed",
                "bbox": [150, 400, 650, 650],
            })

        return {
            "pages": pages,
            "metadata": {
                "title": "Mock Research Paper (MinerU would extract real metadata)",
                "author": "Demo Author",
                "num_pages": len(pages),
                "format": "PDF",
            },
            "structured_content": structured,
            "output_dir": output_dir,
            "_note": "MOCK: Set USE_REAL_PARSERS=True and install MinerU for real parsing",
        }

    # 真实实现：使用 MinerU 或 PyMuPDF
    try:
        # 首选：MinerU
        # from mineru.parser import PDFParser
        # parser = PDFParser()
        # result = parser.parse(pdf_path)

        # 备选：PyMuPDF
        doc = fitz.open(pdf_path)
        pages = []

        for i in range(len(doc)):
            page = doc[i]

            # 渲染为图像
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))  # 2x 缩放
            page_path = os.path.join(output_dir, f"page_{i+1:03d}.png")
            pix.save(page_path)

            # 提取文本
            text = page.get_text()

            pages.append({
                "page_idx": i,
                "image_path": page_path,
                "width": page.rect.width,
                "height": page.rect.height,
                "kind": "page",
                "ocr_text": text[:1000],  # 前1000字符
            })

        doc.close()

        return {
            "pages": pages,
            "metadata": {
                "num_pages": len(pages),
                "format": "PDF",
            },
            "structured_content": {
                "tables": [],
                "figures": [],
                "text_blocks": [],
            },
            "output_dir": output_dir,
        }

    except Exception as e:
        logger.error(f"PDF parsing error: {e}")
        return {
            "error": str(e),
            "pages": [],
        }


async def _parse_html(html_path: str, output_dir: str) -> dict[str, Any]:
    """解析 HTML（使用 playwright 截图）"""

    if not USE_REAL_PARSERS:
        # Mock: 创建模拟页面
        pages = []

        for i in range(3):
            img = Image.new('RGB', (1200, 2000), color=(250, 250, 250))
            from PIL import ImageDraw, ImageFont
            draw = ImageDraw.Draw(img)

            try:
                font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 20)
            except:
                font = ImageFont.load_default()

            draw.text((50, 50), f"Mock Web Page {i+1} - HTML Screenshot", fill='#333', font=font)
            draw.rectangle([50, 100, 1150, 1900], fill='#fff', outline='#ddd')

            page_path = os.path.join(output_dir, f"page_{i+1:03d}.png")
            img.save(page_path)

            pages.append({
                "page_idx": i,
                "image_path": page_path,
                "width": 1200,
                "height": 2000,
                "kind": "web_page",
            })

        return {
            "pages": pages,
            "metadata": {
                "title": "Mock Web Page",
                "url": f"file://{html_path}",
                "num_pages": len(pages),
                "format": "HTML",
            },
            "structured_content": {
                "tables": [],
                "figures": [],
                "text_blocks": [],
            },
            "output_dir": output_dir,
            "_note": "MOCK: Set USE_REAL_PARSERS=True and install playwright for real parsing",
        }

    # 真实实现：playwright
    try:
        from playwright.async_api import async_playwright

        pages = []

        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page(viewport={'width': 1280, 'height': 800})

            await page.goto(f"file://{os.path.abspath(html_path)}")

            # 截图
            screenshot_path = os.path.join(output_dir, "page_001.png")
            await page.screenshot(path=screenshot_path, full_page=True)

            pages.append({
                "page_idx": 0,
                "image_path": screenshot_path,
                "width": 1280,
                "height": 800,
                "kind": "web_page",
            })

            await browser.close()

        return {
            "pages": pages,
            "metadata": {
                "format": "HTML",
                "num_pages": len(pages),
            },
            "structured_content": {},
            "output_dir": output_dir,
        }

    except Exception as e:
        logger.error(f"HTML parsing error: {e}")
        return {
            "error": str(e),
            "pages": [],
        }


async def _parse_markdown(md_path: str, output_dir: str) -> dict[str, Any]:
    """解析 Markdown"""

    with open(md_path, 'r', encoding='utf-8') as f:
        content = f.read()

    if not USE_REAL_PARSERS:
        content = _mock_markdown_content()

    # 创建模拟渲染页面
    img = Image.new('RGB', (800, 1200), color=(255, 255, 255))
    from PIL import ImageDraw, ImageFont
    draw = ImageDraw.Draw(img)

    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 16)
        code_font = ImageFont.truetype("/System/Library/Fonts/Monaco.ttf", 12)
    except:
        font = ImageFont.load_default()
        code_font = font

    # 简单渲染 markdown 文本
    y = 50
    lines = content.split('\n')
    for line in lines[:50]:  # 只渲染前50行
        if line.startswith('# '):
            draw.text((50, y), line[2:], fill='#1a1a2e', font=font)
            y += 30
        elif line.startswith('## '):
            draw.text((50, y), line[3:], fill='#16213e', font=font)
            y += 25
        else:
            draw.text((50, y), line[:80], fill='#333', font=code_font)
            y += 20

        if y > 1100:
            break

    page_path = os.path.join(output_dir, "page_001.png")
    img.save(page_path)

    return {
        "pages": [{
            "page_idx": 0,
            "image_path": page_path,
            "width": 800,
            "height": 1200,
            "kind": "markdown",
            "markdown": content,
        }],
        "metadata": {
            "title": Path(md_path).stem,
            "format": "Markdown",
            "num_pages": 1,
        },
        "structured_content": {
            "text_blocks": content.split('\n\n'),
        },
        "output_dir": output_dir,
    }


async def extract_regions(
    page_path: str,
    regions: list[dict[str, Any]],
    output_dir: str,
) -> list[dict[str, Any]]:
    """
    从页面提取指定区域

    Args:
        page_path: 页面图像路径
        regions: 区域列表 [{"bbox": [x1,y1,x2,y2], "label": str, "kind": str}]
        output_dir: 输出目录

    Returns:
        裁剪后的区域列表
    """
    img = Image.open(page_path)
    results = []

    for i, region in enumerate(regions):
        bbox = region.get("bbox", [0, 0, 100, 100])
        x1, y1, x2, y2 = bbox

        # 裁剪
        cropped = img.crop((x1, y1, x2, y2))

        # 保存
        region_path = os.path.join(output_dir, f"region_{i:03d}_{region.get('kind', 'unknown')}.png")
        cropped.save(region_path)

        results.append({
            "path": region_path,
            "bbox": bbox,
            "label": region.get("label", f"region_{i}"),
            "kind": region.get("kind", "unknown"),
        })

    return results
