"""
目标检测 RPC 方法

基于 YOLO (Ultralytics) 实现。

方法:
- detect.yolo: 通用目标检测
- detect.custom: 自定义模型检测

Sprint: S1-3
"""

from __future__ import annotations

import logging
import time
from typing import Any

from .yolo_detect import get_detector

logger = logging.getLogger(__name__)

# 是否使用真实模型
USE_REAL_MODELS = False  # Sprint 1 完成后设为 True


async def yolo(
    image_path: str,
    classes: list[str] | None = None,
    confidence: float = 0.5,
    model: str = "yolov8n",
) -> dict[str, Any]:
    """
    YOLO 目标检测

    Args:
        image_path: 图像文件路径
        classes: 要检测的类别列表 (None 表示所有)
        confidence: 置信度阈值 (0-1)
        model: YOLO 模型 (yolov8n, yolov8s, yolov8m, yolov8l)

    Returns:
        {
            "detections": [
                {
                    "class": str,        # 类别名称
                    "confidence": float, # 置信度
                    "box": {            # 归一化边界框 (0-1)
                        "x1": float,
                        "y1": float,
                        "x2": float,
                        "y2": float
                    },
                    "center": {"x": float, "y": float}
                }
            ],
            "count": int,               # 检测总数
            "model": str,               # 使用的模型
            "latency_ms": int
        }
    """
    start_time = time.time()

    if not USE_REAL_MODELS:
        # 骨架实现
        logger.info(f"[MOCK] yolo: {image_path}, model={model}")

        return {
            "detections": [
                {
                    "class": "person" if not classes else classes[0],
                    "confidence": 0.85,
                    "box": {"x1": 0.1, "y1": 0.1, "x2": 0.5, "y2": 0.8},
                    "center": {"x": 0.3, "y": 0.45},
                }
            ],
            "count": 1,
            "model": model,
            "latency_ms": int((time.time() - start_time) * 1000),
            "_note": "设置 USE_REAL_MODELS=True 启用真实 YOLO",
        }

    # 真实实现
    try:
        detector = get_detector(f"{model}.pt")
        result = detector.detect(
            image_path,
            classes=classes,
            confidence=confidence,
        )

        result["latency_ms"] = int((time.time() - start_time) * 1000)
        return result

    except Exception as e:
        logger.error(f"YOLO error: {e}")
        return {
            "detections": [],
            "count": 0,
            "model": model,
            "latency_ms": int((time.time() - start_time) * 1000),
            "error": str(e),
        }
