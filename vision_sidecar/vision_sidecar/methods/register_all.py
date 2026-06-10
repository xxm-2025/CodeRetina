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
    # Sprint 5: Agentic Visual Search (方向 A)
    # =========================================================================
    try:
        from . import vlm_agentic

        server.register("vlm.agentic_qa", vlm_agentic.agentic_qa)
        server.register("vlm.agentic_list_traces", vlm_agentic.list_traces)

        logger.info("Sprint 5 方法已注册 (vlm_agentic)")
    except ImportError as e:
        logger.warning(f"Sprint 5 方法注册失败: {e}")

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
        # S6-B5: Video chapter support
        server.register("rag.store_video_chapter", rag.store_video_chapter)
        server.register("rag.search_video_chapters", rag.search_video_chapters)

        logger.info("Sprint 4 方法已注册 (embed, rag)")
    except ImportError as e:
        logger.warning(f"Sprint 4 方法注册失败: {e}")

    # =========================================================================
    # Sprint 6: Long-Form Video / Screen Replay (方向 B)
    # =========================================================================
    try:
        from . import video

        server.register("video.extract_keyframes", video.extract_keyframes)
        server.register("video.summarize", video.summarize)
        server.register("video.qa", video.qa)
        server.register("video.list_sessions", video.list_sessions)

        logger.info("Sprint 6 方法已注册 (video)")
    except ImportError as e:
        logger.warning(f"Sprint 6 方法注册失败: {e}")

    # =========================================================================
    # Sprint 7: Multi-modal RAG / Document (方向 C)
    # =========================================================================
    try:
        from . import doc, chart_table

        # Document parsing
        server.register("doc.parse", doc.parse)
        server.register("doc.extract_regions", doc.extract_regions)

        # Chart/Table analysis
        server.register("chart_table.detect_regions", chart_table.detect_regions)
        server.register("chart_table.crop_regions", chart_table.crop_regions)
        server.register("chart_table.describe_chart", chart_table.describe_chart)
        server.register("chart_table.describe_table", chart_table.describe_table)
        server.register("chart_table.analyze_document_page", chart_table.analyze_document_page)

        logger.info("Sprint 7 方法已注册 (doc, chart_table)")
    except ImportError as e:
        logger.warning(f"Sprint 7 方法注册失败: {e}")

    # =========================================================================
    # Sprint 7: Visual Planning / World Model (方向 D)
    # =========================================================================
    try:
        from . import gui_agent
        from .gui_planner import planner as gui_planner

        # GUI Agent with planning
        server.register("gui_agent.execute", gui_agent.execute_with_planning)
        server.register("gui_agent.compare_modes", gui_agent.compare_modes)

        # GUI Planner
        server.register("gui_planner.plan", gui_planner.plan_single_step)
        server.register("gui_planner.list_sessions", gui_planner.list_plan_sessions)

        logger.info("Sprint 7 方法已注册 (gui_agent, gui_planner)")
    except ImportError as e:
        logger.warning(f"Sprint 7 方法注册失败: {e}")

    # =========================================================================
    # Extended RAG methods (Sprint 6 + 7)
    # =========================================================================
    try:
        from . import rag

        # Sprint 6-B5: Video chapters
        server.register("rag.store_video_chapter", rag.store_video_chapter)
        server.register("rag.search_video_chapters", rag.search_video_chapters)

        # Sprint 7-C5: Document RAG with MaxSim
        server.register("rag.search_with_maxsim", rag.search_with_maxsim)
        server.register("rag.store_document_region", rag.store_document_region)
        server.register("rag.query_document", rag.query_document)

        logger.info("Extended RAG 方法已注册")
    except ImportError as e:
        logger.warning(f"Extended RAG 方法注册失败: {e}")

    logger.info(f"共注册 {len(server.methods)} 个方法")
