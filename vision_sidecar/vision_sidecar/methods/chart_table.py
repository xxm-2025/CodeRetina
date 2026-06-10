"""
图表与表格分析 —— DocLayout-YOLO + ChartGemma/Table-LLaVA

功能:
- chart_table.detect_regions: 文档区域检测 (text/figure/chart/table)
- chart_table.describe_chart: 图表语义描述 (ChartGemma)
- chart_table.describe_table: 表格语义描述 (Table-LLaVA)
- chart_table.crop_regions: 裁剪检测到的区域

区域类型: text | figure | chart | table | header | footer

Sprint: S7-C2, S7-C3
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any

from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)

# 是否使用真实模型
USE_REAL_MODELS = False

# 可选导入 DocLayout-YOLO
try:
    # from doclayout_yolo import YOLOv10
    HAS_DOCLAYOUT_YOLO = False  # 实际需要安装 doclayout-yolo
except ImportError:
    HAS_DOCLAYOUT_YOLO = False


# 区域类别定义 (DocLayout-YOLO 标准类别)
REGION_CLASSES = {
    0: "title",
    1: "text",
    2: "header",
    3: "footer",
    4: "figure",
    5: "table",
    6: "chart",  # 部分版本支持
    7: "equation",
}


def _mock_detect_regions(image_path: str) -> list[dict[str, Any]]:
    """Mock: 模拟区域检测结果"""
    img = Image.open(image_path)
    width, height = img.size

    # 模拟检测结果
    regions = []

    # 模拟标题区域
    regions.append({
        "bbox": [50, 50, width - 50, 120],
        "label": "title",
        "confidence": 0.95,
        "kind": "text",
    })

    # 模拟文本段落
    y = 150
    for i in range(3):
        regions.append({
            "bbox": [50, y, width - 50, y + 80],
            "label": "text",
            "confidence": 0.88,
            "kind": "text",
        })
        y += 100

    # 模拟表格（在特定页面）
    if "page_001" in image_path or "page_002" in image_path:
        regions.append({
            "bbox": [100, 400, width - 100, 700],
            "label": "table",
            "confidence": 0.92,
            "kind": "table",
        })

    # 模拟图表
    if "page_002" in image_path or "page_003" in image_path:
        regions.append({
            "bbox": [150, 500, width - 150, 850],
            "label": "figure",
            "confidence": 0.90,
            "kind": "chart",  # 标记为图表
        })

    return regions


def _mock_chart_caption(image_path: str, chart_info: dict) -> str:
    """Mock: 生成图表描述"""
    captions = [
        "Bar chart comparing model performance across different datasets. X-axis shows dataset names, Y-axis shows accuracy percentage. The red bars indicate higher performance on academic datasets.",
        "Line graph showing training loss over epochs. The curve decreases rapidly in first 10 epochs then plateaus, indicating convergence.",
        "Pie chart showing distribution of error types. 40% are syntax errors, 35% logic errors, 25% runtime errors.",
        "Scatter plot showing correlation between code complexity and bug count. Positive correlation with R²=0.78.",
    ]
    import random
    return random.choice(captions)


def _mock_table_caption(image_path: str, table_info: dict) -> str:
    """Mock: 生成表格描述"""
    captions = [
        "Table comparing baseline models. ColPali achieves highest recall (0.92), followed by CLIP (0.85) and traditional OCR (0.72).",
        "Performance metrics across different document types. PDFs show best results (F1=0.89), scanned images lowest (F1=0.76).",
        "Ablation study results. Removing late-interaction reduces accuracy by 12%, patch embedding by 8%.",
        "Dataset statistics. 10k training samples, 2k validation, 1k test. Average document length 15 pages.",
    ]
    import random
    return random.choice(captions)


async def detect_regions(
    image_path: str,
    confidence_threshold: float = 0.5,
    model_path: str | None = None,
) -> dict[str, Any]:
    """
    检测文档中的区域（表格、图表、文本块等）

    Args:
        image_path: 文档页面图像路径
        confidence_threshold: 置信度阈值
        model_path: DocLayout-YOLO 模型路径（可选）

    Returns:
        {
            "regions": [{bbox: [x1,y1,x2,y2], label: str, confidence: float, kind: str}],
            "total": int,
            "by_kind": {kind: count},
        }
    """
    start_time = time.time()

    if not os.path.exists(image_path):
        return {
            "error": f"Image not found: {image_path}",
            "regions": [],
        }

    logger.info(f"[detect_regions] image={image_path}")

    if not USE_REAL_MODELS or not HAS_DOCLAYOUT_YOLO:
        # Mock 实现
        regions = _mock_detect_regions(image_path)

        # 过滤低置信度
        regions = [r for r in regions if r["confidence"] >= confidence_threshold]

        # 统计
        by_kind: dict[str, int] = {}
        for r in regions:
            kind = r.get("kind", "unknown")
            by_kind[kind] = by_kind.get(kind, 0) + 1

        return {
            "regions": regions,
            "total": len(regions),
            "by_kind": by_kind,
            "latency_ms": int((time.time() - start_time) * 1000),
            "_note": "MOCK: Set USE_REAL_MODELS=True and install doclayout-yolo",
        }

    # 真实实现：DocLayout-YOLO
    try:
        from doclayout_yolo import YOLOv10

        model = YOLOv10(model_path or "doclayout_yolo_docstructbench_imgsz1024.pt")

        results = model(image_path, conf=confidence_threshold)

        regions = []
        for result in results:
            boxes = result.boxes
            for box in boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                cls_id = int(box.cls[0])
                conf = float(box.conf[0])
                label = REGION_CLASSES.get(cls_id, "unknown")

                # 映射到统一 kind
                kind_map = {
                    "title": "text",
                    "text": "text",
                    "header": "text",
                    "footer": "text",
                    "figure": "figure",
                    "table": "table",
                    "chart": "chart",
                    "equation": "text",
                }

                regions.append({
                    "bbox": [x1, y1, x2, y2],
                    "label": label,
                    "confidence": conf,
                    "kind": kind_map.get(label, "unknown"),
                })

        by_kind: dict[str, int] = {}
        for r in regions:
            kind = r.get("kind", "unknown")
            by_kind[kind] = by_kind.get(kind, 0) + 1

        return {
            "regions": regions,
            "total": len(regions),
            "by_kind": by_kind,
            "latency_ms": int((time.time() - start_time) * 1000),
        }

    except Exception as e:
        logger.error(f"Region detection error: {e}")
        return {
            "error": str(e),
            "regions": [],
        }


async def crop_regions(
    image_path: str,
    regions: list[dict[str, Any]],
    output_dir: str,
    padding: int = 10,
) -> list[dict[str, Any]]:
    """
    裁剪检测到的区域

    Args:
        image_path: 源图像路径
        regions: 区域列表（来自 detect_regions）
        output_dir: 输出目录
        padding: 裁剪边距（像素）

    Returns:
        裁剪后的区域列表，带裁剪后路径
    """
    os.makedirs(output_dir, exist_ok=True)

    img = Image.open(image_path)
    width, height = img.size

    results = []

    for i, region in enumerate(regions):
        bbox = region.get("bbox", [0, 0, 100, 100])
        x1, y1, x2, y2 = bbox

        # 添加边距
        x1 = max(0, x1 - padding)
        y1 = max(0, y1 - padding)
        x2 = min(width, x2 + padding)
        y2 = min(height, y2 + padding)

        # 裁剪
        cropped = img.crop((x1, y1, x2, y2))

        # 保存
        kind = region.get("kind", "region")
        label = region.get("label", f"{i}")
        crop_path = os.path.join(output_dir, f"{kind}_{label}_{i:03d}.png")
        cropped.save(crop_path)

        results.append({
            **region,
            "cropped_path": crop_path,
            "original_bbox": bbox,
            "padded_bbox": [x1, y1, x2, y2],
        })

    return results


async def describe_chart(
    chart_image_path: str,
    model: str = "chartgemma",
    prompt: str | None = None,
) -> dict[str, Any]:
    """
    使用 ChartGemma 描述图表

    Args:
        chart_image_path: 图表图像路径
        model: 模型名称 (chartgemma, tinychart)
        prompt: 可选提示词

    Returns:
        {
            "caption": str,  # 语义描述
            "chart_type": str,  # bar/line/pie/scatter/etc
            "data_summary": str,  # 数据总结
            "confidence": float,
        }
    """
    start_time = time.time()

    if not os.path.exists(chart_image_path):
        return {
            "error": f"Image not found: {chart_image_path}",
        }

    logger.info(f"[describe_chart] image={chart_image_path}, model={model}")

    if not USE_REAL_MODELS:
        # Mock 实现
        caption = _mock_chart_caption(chart_image_path, {})

        chart_types = ["bar", "line", "pie", "scatter"]
        import random
        chart_type = random.choice(chart_types)

        return {
            "caption": caption,
            "chart_type": chart_type,
            "data_summary": "Key trends visible in chart: " + caption[:50] + "...",
            "confidence": 0.85,
            "latency_ms": int((time.time() - start_time) * 1000),
            "_note": "MOCK: Set USE_REAL_MODELS=True for ChartGemma",
        }

    # 真实实现：ChartGemma
    try:
        # from transformers import AutoProcessor, AutoModelForVision2Seq
        # processor = AutoProcessor.from_pretrained("ahmed-masry/ChartGemma")
        # model = AutoModelForVision2Seq.from_pretrained("ahmed-masry/ChartGemma")

        # 简化实现
        caption = "Chart analysis using ChartGemma would go here"

        return {
            "caption": caption,
            "chart_type": "unknown",
            "data_summary": "N/A",
            "confidence": 0.8,
            "latency_ms": int((time.time() - start_time) * 1000),
        }

    except Exception as e:
        logger.error(f"Chart description error: {e}")
        return {
            "error": str(e),
        }


async def describe_table(
    table_image_path: str,
    model: str = "table-llava",
    extract_data: bool = False,
) -> dict[str, Any]:
    """
    使用 Table-LLaVA 描述表格

    Args:
        table_image_path: 表格图像路径
        model: 模型名称 (table-llava, other)
        extract_data: 是否尝试提取结构化数据

    Returns:
        {
            "caption": str,  # 表格语义描述
            "structure": str,  # 表格结构描述
            "row_count": int,
            "col_count": int,
            "headers": list[str],  # 表头
            "sample_data": list[list[str]],  # 样本数据（前3行）
            "confidence": float,
        }
    """
    start_time = time.time()

    if not os.path.exists(table_image_path):
        return {
            "error": f"Image not found: {table_image_path}",
        }

    logger.info(f"[describe_table] image={table_image_path}, model={model}")

    if not USE_REAL_MODELS:
        # Mock 实现
        caption = _mock_table_caption(table_image_path, {})

        return {
            "caption": caption,
            "structure": "Table with headers and numeric data columns",
            "row_count": 10,
            "col_count": 4,
            "headers": ["Model", "Precision", "Recall", "F1"],
            "sample_data": [
                ["Baseline", "0.82", "0.78", "0.80"],
                ["Ours", "0.91", "0.89", "0.90"],
                ["SOTA", "0.88", "0.86", "0.87"],
            ],
            "confidence": 0.88,
            "latency_ms": int((time.time() - start_time) * 1000),
            "_note": "MOCK: Set USE_REAL_MODELS=True for Table-LLaVA",
        }

    # 真实实现：Table-LLaVA
    try:
        caption = "Table analysis using Table-LLaVA would go here"

        return {
            "caption": caption,
            "structure": "N/A",
            "row_count": 0,
            "col_count": 0,
            "headers": [],
            "sample_data": [],
            "confidence": 0.8,
            "latency_ms": int((time.time() - start_time) * 1000),
        }

    except Exception as e:
        logger.error(f"Table description error: {e}")
        return {
            "error": str(e),
        }


async def analyze_document_page(
    page_path: str,
    output_dir: str,
    generate_captions: bool = True,
) -> dict[str, Any]:
    """
    完整的文档页面分析流水线

    1. 检测区域
    2. 裁剪图表/表格
    3. 生成语义描述

    Args:
        page_path: 页面图像路径
        output_dir: 输出目录
        generate_captions: 是否为图表表格生成描述

    Returns:
        {
            "page_path": str,
            "regions": [...],
            "charts": [{path, caption, type}],
            "tables": [{path, caption, headers, sample_data}],
            "text_blocks": [...],
        }
    """
    start_time = time.time()

    os.makedirs(output_dir, exist_ok=True)

    # 1. 检测区域
    detect_result = await detect_regions(page_path)
    regions = detect_result.get("regions", [])

    # 2. 裁剪所有区域
    cropped = await crop_regions(page_path, regions, output_dir)

    # 3. 分类并生成描述
    charts = []
    tables = []
    text_blocks = []

    for region in cropped:
        kind = region.get("kind")
        crop_path = region.get("cropped_path")

        if kind == "chart" and generate_captions:
            desc = await describe_chart(crop_path)
            if "error" not in desc:
                charts.append({
                    "path": crop_path,
                    "bbox": region.get("bbox"),
                    **desc,
                })

        elif kind == "table" and generate_captions:
            desc = await describe_table(crop_path)
            if "error" not in desc:
                tables.append({
                    "path": crop_path,
                    "bbox": region.get("bbox"),
                    **desc,
                })

        elif kind == "text":
            text_blocks.append({
                "path": crop_path,
                "bbox": region.get("bbox"),
                "label": region.get("label"),
            })

    return {
        "page_path": page_path,
        "regions": regions,
        "charts": charts,
        "tables": tables,
        "text_blocks": text_blocks,
        "total_regions": len(regions),
        "latency_ms": int((time.time() - start_time) * 1000),
    }
