"""
视觉语言模型 (VLM) RPC 方法

支持模型:
- Moondream 2 (轻量, 2B)
- MiniCPM-V 2.6 (高性能, 8B)

方法:
- vlm.caption: 图像描述
- vlm.query: 视觉问答
- vlm.detect: 目标检测

Sprint: S1-2
"""

from __future__ import annotations

import logging
import time
from typing import Any

from PIL import Image

from .vlm_real import get_manager

logger = logging.getLogger(__name__)

# 是否使用真实模型（环境变量控制）
USE_REAL_MODELS = False  # Sprint 1 完成后设为 True


async def caption(
    image_path: str,
    model: str = "moondream2",
    prompt: str = "describe",
    max_tokens: int = 256,
) -> dict[str, Any]:
    """
    生成图像描述

    Args:
        image_path: 图像文件路径
        model: 模型名称 (moondream2, minicpm-v-2.6)
        prompt: 提示词类型 (describe, detailed, tags)
        max_tokens: 最大输出 token 数

    Returns:
        {
            "text": str,           # 生成的描述
            "confidence": float,   # 置信度 (0-1)
            "model": str,          # 实际使用的模型
            "latency_ms": int,      # 延迟（毫秒）
            "tokens": {"input": int, "output": int}
        }
    """
    start_time = time.time()

    if not USE_REAL_MODELS:
        # 骨架实现
        logger.info(f"[MOCK] caption: {image_path}, model={model}")
        latency_ms = int((time.time() - start_time) * 1000)

        return {
            "text": f"[MOCK] 这是一个图像描述占位符。图像路径: {image_path}",
            "confidence": 0.85,
            "model": model,
            "latency_ms": latency_ms,
            "tokens": {"input": 1024, "output": 50},
            "_note": "设置 USE_REAL_MODELS=True 启用真实模型",
        }

    # 真实实现
    try:
        manager = get_manager()
        vlm_model = manager.get_model(model)

        # 加载图像
        image = Image.open(image_path).convert("RGB")

        # 生成描述
        text, confidence = await vlm_model.caption(image, prompt)

        latency_ms = int((time.time() - start_time) * 1000)

        return {
            "text": text,
            "confidence": confidence,
            "model": model,
            "latency_ms": latency_ms,
            "tokens": {"input": 1024, "output": len(text.split())},  # 近似
        }

    except Exception as e:
        logger.error(f"Caption error: {e}")
        return {
            "text": f"[Error: {e}]",
            "confidence": 0.0,
            "model": model,
            "latency_ms": int((time.time() - start_time) * 1000),
            "error": str(e),
        }


async def query(
    image_path: str,
    question: str,
    model: str = "moondream2",
    max_tokens: int = 256,
) -> dict[str, Any]:
    """
    视觉问答

    Args:
        image_path: 图像文件路径
        question: 问题文本
        model: 模型名称
        max_tokens: 最大输出 token 数

    Returns:
        {
            "answer": str,         # 回答文本
            "confidence": float,
            "model": str,
            "latency_ms": int,
            "tokens": {"input": int, "output": int}
        }
    """
    start_time = time.time()

    if not USE_REAL_MODELS:
        logger.info(f"[MOCK] query: {question}, image={image_path}")
        latency_ms = int((time.time() - start_time) * 1000)

        return {
            "answer": f"[MOCK] 这是对问题的占位回答。问题: {question}",
            "confidence": 0.78,
            "model": model,
            "latency_ms": latency_ms,
            "tokens": {"input": 1024, "output": 30},
            "_note": "设置 USE_REAL_MODELS=True 启用真实模型",
        }

    # 真实实现
    try:
        manager = get_manager()
        vlm_model = manager.get_model(model)

        image = Image.open(image_path).convert("RGB")
        answer, confidence = await vlm_model.query(image, question)

        latency_ms = int((time.time() - start_time) * 1000)

        return {
            "answer": answer,
            "confidence": confidence,
            "model": model,
            "latency_ms": latency_ms,
            "tokens": {"input": 1024, "output": len(answer.split())},
        }

    except Exception as e:
        logger.error(f"Query error: {e}")
        return {
            "answer": f"[Error: {e}]",
            "confidence": 0.0,
            "model": model,
            "latency_ms": int((time.time() - start_time) * 1000),
            "error": str(e),
        }


async def detect(
    image_path: str,
    target: str | None = None,
    model: str = "moondream2",
) -> dict[str, Any]:
    """
    图像中的目标检测

    Args:
        image_path: 图像文件路径
        target: 要检测的目标类别（如 "button", "text"）
        model: 模型名称

    Returns:
        {
            "boxes": [{           # 边界框列表
                "x": int,        # 左上角 x
                "y": int,        # 左上角 y
                "width": int,
                "height": int,
                "label": str,    # 类别标签
                "confidence": float
            }],
            "count": int,         # 检测到的数量
            "model": str,
            "latency_ms": int
        }
    """
    start_time = time.time()

    if not USE_REAL_MODELS:
        logger.info(f"[MOCK] detect: target={target}, image={image_path}")
        mock_boxes = [
            {
                "x": 100,
                "y": 100,
                "width": 200,
                "height": 50,
                "label": target or "object",
                "confidence": 0.82,
            }
        ]

        return {
            "boxes": mock_boxes,
            "count": len(mock_boxes),
            "model": model,
            "latency_ms": int((time.time() - start_time) * 1000),
            "_note": "设置 USE_REAL_MODELS=True 启用真实模型",
        }

    # 真实实现
    try:
        manager = get_manager()
        vlm_model = manager.get_model(model)

        image = Image.open(image_path).convert("RGB")
        boxes = await vlm_model.detect(image, target)

        latency_ms = int((time.time() - start_time) * 1000)

        return {
            "boxes": boxes,
            "count": len(boxes),
            "model": model,
            "latency_ms": latency_ms,
        }

    except Exception as e:
        logger.error(f"Detect error: {e}")
        return {
            "boxes": [],
            "count": 0,
            "model": model,
            "latency_ms": int((time.time() - start_time) * 1000),
            "error": str(e),
        }


async def list_models() -> dict[str, Any]:
    """
    列出可用的 VLM 模型

    Returns:
        {
            "models": [
                {
                    "id": str,           # 模型标识
                    "name": str,         # 显示名称
                    "size": str,         # 模型大小 (2B, 8B)
                    "capabilities": [str],  # 支持的功能
                    "loaded": bool,      # 是否已加载
                    "local": bool        # 是否为本地模型
                }
            ]
        }
    """
    return {
        "models": [
            {
                "id": "moondream2",
                "name": "Moondream 2",
                "size": "2B",
                "capabilities": ["caption", "query", "detect"],
                "loaded": False,
                "local": True,
            },
            {
                "id": "minicpm-v-2.6",
                "name": "MiniCPM-V 2.6",
                "size": "8B",
                "capabilities": ["caption", "query", "detect", "ocr"],
                "loaded": False,
                "local": True,
            },
        ]
    }
