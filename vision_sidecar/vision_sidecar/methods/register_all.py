"""
注册所有 RPC 方法到服务器

在服务器启动时调用，集中注册所有可用方法。
Sprint: S0-6 / S1 / S2 / S3 / S4
"""

from __future__ import annotations

import logging

from vision_sidecar.server import SidecarServer

logger = logging.getLogger(__name__)


def register_all(server: SidecarServer) -> None:
    """
    注册所有 RPC 方法

    Args:
        server: SidecarServer 实例
    """
    logger.info("注册 RPC 方法...")

    # =========================================================================
    # Sprint 0: 基础方法 (已内置在 server.py)
    # - echo
    # - health.ping
    # - system.info
    # - system.initialize
    # =========================================================================

    # =========================================================================
    # Sprint 1: VLM + 检测
    # =========================================================================
    try:
        from . import vlm, detect

        server.register("vlm.caption", vlm.caption)
        server.register("vlm.query", vlm.query)
        server.register("vlm.detect", vlm.detect)
        server.register("vlm.list_models", vlm.list_models)

        server.register("detect.yolo", detect.yolo)

        logger.info("Sprint 1 方法已注册 (vlm, detect)")
    except ImportError as e:
        logger.warning(f"Sprint 1 方法注册失败: {e}")

    # =========================================================================
    # Sprint 2: OCR + 图像处理 (占位)
    # =========================================================================
    # try:
    #     from . import ocr, image
    #     server.register("ocr.extract", ocr.extract)
    #     server.register("image.diff", image.diff)
    #     logger.info("Sprint 2 方法已注册 (ocr, image)")
    # except ImportError as e:
    #     logger.warning(f"Sprint 2 方法注册失败: {e}")

    # =========================================================================
    # Sprint 3: GUI 操作
    # =========================================================================
    try:
        from . import gui

        server.register("gui.execute", gui.execute)
        server.register("gui.click", gui.click)
        server.register("gui.type", gui.type_text)
        server.register("gui.screenshot", gui.screenshot)

        logger.info("Sprint 3 方法已注册 (gui)")
    except ImportError as e:
        logger.warning(f"Sprint 3 方法注册失败: {e}")

    # =========================================================================
    # Sprint 4: 嵌入 + RAG
    # =========================================================================
    try:
        from . import embed, rag

        server.register("embed.image", embed.image)
        server.register("embed.text", embed.text)
        server.register("embed.similarity", embed.similarity)
        server.register("rag.store", rag.store)
        server.register("rag.search", rag.search)
        server.register("rag.query", rag.query)
        server.register("rag.list", rag.list_all)

        logger.info("Sprint 4 方法已注册 (embed, rag)")
    except ImportError as e:
        logger.warning(f"Sprint 4 方法注册失败: {e}")

    logger.info(f"共注册 {len(server.methods)} 个方法")
