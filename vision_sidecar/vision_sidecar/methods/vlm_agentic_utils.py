"""
Agentic Visual Search 图像处理工具

实现 crop/zoom/annotate/grid_split 等图像操作原语
供 vlm.agentic_qa 循环内部调用

Sprint: S5-A2
"""

from __future__ import annotations

import logging
import os
from typing import Any

from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)


def crop_image(
    image: Image.Image,
    bbox: tuple[int, int, int, int],
) -> Image.Image:
    """
    裁剪图像到指定区域

    Args:
        image: 原始 PIL Image
        bbox: 边界框 (x1, y1, x2, y2)

    Returns:
        裁剪后的 Image
    """
    x1, y1, x2, y2 = bbox
    width, height = image.size

    # 边界检查
    x1 = max(0, min(x1, width))
    y1 = max(0, min(y1, height))
    x2 = max(0, min(x2, width))
    y2 = max(0, min(y2, height))

    # 确保 x1 < x2, y1 < y2
    if x1 >= x2:
        x2 = min(width, x1 + 100)
    if y1 >= y2:
        y2 = min(height, y1 + 100)

    return image.crop((x1, y1, x2, y2))


def zoom_image(
    image: Image.Image,
    factor: int,
    center: tuple[int, int] | None = None,
) -> Image.Image:
    """
    缩放图像（放大特定区域）

    Args:
        image: 原始 PIL Image
        factor: 放大倍数 (2-4)
        center: 中心点坐标 (x, y)，默认图像中心

    Returns:
        缩放后的 Image（保持原始尺寸，显示放大区域）
    """
    factor = max(1, min(factor, 4))  # 限制 1-4x
    width, height = image.size

    if center is None:
        center = (width // 2, height // 2)

    cx, cy = center

    # 计算裁剪区域（基于放大倍数）
    crop_w = width // factor
    crop_h = height // factor

    x1 = max(0, cx - crop_w // 2)
    y1 = max(0, cy - crop_h // 2)
    x2 = min(width, x1 + crop_w)
    y2 = min(height, y1 + crop_h)

    # 调整以确保尺寸一致
    if x2 - x1 < crop_w:
        x1 = max(0, x2 - crop_w)
    if y2 - y1 < crop_h:
        y1 = max(0, y2 - crop_h)

    # 裁剪后放大回原始尺寸
    cropped = image.crop((x1, y1, x2, y2))
    zoomed = cropped.resize((width, height), Image.Resampling.LANCZOS)

    return zoomed


def annotate_image(
    image: Image.Image,
    regions: list[dict[str, Any]],
    labels: list[str] | None = None,
) -> Image.Image:
    """
    在图像上绘制标注框和标签

    Args:
        image: 原始 PIL Image
        regions: 区域列表，每项包含 bbox: [x1, y1, x2, y2]
        labels: 标签列表，与 regions 一一对应

    Returns:
        标注后的 Image
    """
    result = image.copy()
    draw = ImageDraw.Draw(result)

    # 尝试加载字体
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 16)
    except:
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 16)
        except:
            font = ImageFont.load_default()

    colors = [
        "#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A",
        "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E2",
    ]

    for i, region in enumerate(regions):
        bbox = region.get("bbox", [0, 0, 100, 100])
        x1, y1, x2, y2 = bbox

        color = colors[i % len(colors)]
        label = labels[i] if labels and i < len(labels) else str(i + 1)

        # 绘制矩形框
        draw.rectangle([x1, y1, x2, y2], outline=color, width=3)

        # 绘制标签背景
        text_bbox = draw.textbbox((0, 0), label, font=font)
        text_w = text_bbox[2] - text_bbox[0]
        text_h = text_bbox[3] - text_bbox[1]

        label_bg = [x1, y1 - text_h - 4, x1 + text_w + 8, y1]
        if label_bg[1] < 0:  # 防止超出顶部
            label_bg = [x1, y1, x1 + text_w + 8, y1 + text_h + 4]

        draw.rectangle(label_bg, fill=color)

        # 绘制标签文字
        text_pos = (label_bg[0] + 4, label_bg[1] + 2)
        draw.text(text_pos, label, fill="white", font=font)

    return result


def grid_split_image(
    image: Image.Image,
    grid_size: tuple[int, int],
    labels: list[str] | None = None,
) -> tuple[Image.Image, list[dict[str, Any]]]:
    """
    将图像分割成网格并标注

    Args:
        image: 原始 PIL Image
        grid_size: (rows, cols) 网格行列数
        labels: 可选标签列表，长度应等于 rows * cols

    Returns:
        (标注后的图像, 每个格子的信息列表)
    """
    rows, cols = grid_size
    width, height = image.size

    cell_w = width // cols
    cell_h = height // rows

    result = image.copy()
    draw = ImageDraw.Draw(result)

    # 尝试加载字体
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 20)
    except:
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 20)
        except:
            font = ImageFont.load_default()

    grid_info = []
    idx = 0

    for row in range(rows):
        for col in range(cols):
            x1 = col * cell_w
            y1 = row * cell_h
            x2 = min(x1 + cell_w, width)
            y2 = min(y1 + cell_h, height)

            # 绘制网格线
            draw.rectangle([x1, y1, x2, y2], outline="#45B7D1", width=2)

            # 确定标签
            if labels and idx < len(labels):
                label = labels[idx]
            else:
                label = f"{chr(65 + idx)}"  # A, B, C, ...

            # 绘制标签（格子左上角）
            text_bbox = draw.textbbox((0, 0), label, font=font)
            text_w = text_bbox[2] - text_bbox[0]
            text_h = text_bbox[3] - text_bbox[1]

            bg_x1, bg_y1 = x1 + 2, y1 + 2
            bg_x2, bg_y2 = bg_x1 + text_w + 6, bg_y1 + text_h + 4

            draw.rectangle([bg_x1, bg_y1, bg_x2, bg_y2], fill="#45B7D1")
            draw.text((bg_x1 + 3, bg_y1 + 2), label, fill="white", font=font)

            grid_info.append({
                "label": label,
                "row": row,
                "col": col,
                "bbox": [x1, y1, x2, y2],
            })

            idx += 1

    return result, grid_info


def save_trace_image(
    image: Image.Image,
    trace_dir: str,
    step: int,
    action: str,
) -> str:
    """
    保存步骤追踪图像

    Args:
        image: 要保存的图像
        trace_dir: 追踪目录
        step: 步骤序号
        action: 动作名称

    Returns:
        保存的文件路径
    """
    os.makedirs(trace_dir, exist_ok=True)
    filename = f"step{step:02d}_{action}.png"
    filepath = os.path.join(trace_dir, filename)
    image.save(filepath, "PNG")
    return filepath


def get_image_hash(image: Image.Image) -> str:
    """
    计算图像的简单哈希（用于缓存）

    Args:
        image: PIL Image

    Returns:
        哈希字符串
    """
    import hashlib

    # 缩小后采样以加快计算
    small = image.resize((64, 64), Image.Resampling.LANCZOS)
    data = small.tobytes()
    return hashlib.md5(data).hexdigest()[:16]
