"""
RAG (Retrieval-Augmented Generation) —— 视觉记忆检索

基于 LanceDB 的向量存储和检索。

方法:
- rag.store: 存储图像+嵌入
- rag.search: 相似性搜索
- rag.query: 文本查询图像

Sprint: S4-1, S4-2
"""

from __future__ import annotations

import logging
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

# 是否使用真实数据库
USE_REAL_DB = False  # Sprint 4 完成后设为 True

# Mock 存储（内存中）
_mock_store: list[dict] = []


class VisionMemoryStore:
    """
    视觉记忆存储

    使用 LanceDB 存储图像嵌入和元数据。
    """

    def __init__(self, db_path: str = "~/.claude/vision_memory.lancedb"):
        self.db_path = Path(db_path).expanduser()
        self._table: Any = None
        self._db: Any = None

    def init(self) -> None:
        """初始化数据库"""
        if USE_REAL_DB:
            try:
                import lancedb

                self._db = lancedb.connect(str(self.db_path))

                # 检查表是否存在
                if "vision_memory" in self._db.table_names():
                    self._table = self._db.open_table("vision_memory")
                else:
                    # 创建新表
                    import pyarrow as pa

                    schema = pa.schema([
                        pa.field("id", pa.string()),
                        pa.field("image_path", pa.string()),
                        pa.field("embedding", pa.list_(pa.float32(), 768)),
                        pa.field("text", pa.string()),
                        pa.field("tags", pa.list_(pa.string())),
                        pa.field("timestamp", pa.int64()),
                        pa.field("source", pa.string()),
                    ])
                    self._table = self._db.create_table("vision_memory", schema=schema)

                logger.info(f"LanceDB initialized: {self.db_path}")

            except Exception as e:
                logger.error(f"LanceDB init error: {e}")
                raise

    def store(
        self,
        image_path: str,
        embedding: list[float],
        text: str = "",
        tags: list[str] | None = None,
        source: str = "unknown",
    ) -> dict[str, Any]:
        """存储图像记忆"""
        record = {
            "id": str(uuid.uuid4()),
            "image_path": image_path,
            "embedding": embedding,
            "text": text,
            "tags": tags or [],
            "timestamp": int(time.time()),
            "source": source,
        }

        if USE_REAL_DB and self._table:
            try:
                import pyarrow as pa

                # 转换为 Arrow 格式
                table_data = pa.table({
                    "id": [record["id"]],
                    "image_path": [record["image_path"]],
                    "embedding": [record["embedding"]],
                    "text": [record["text"]],
                    "tags": [record["tags"]],
                    "timestamp": [record["timestamp"]],
                    "source": [record["source"]],
                })
                self._table.add(table_data)
            except Exception as e:
                logger.error(f"Store error: {e}")
                raise
        else:
            # Mock 存储
            global _mock_store
            _mock_store.append(record)
            logger.info(f"MOCK stored: {record['id']}")

        return record

    def search(
        self,
        query_embedding: list[float],
        top_k: int = 5,
        filter_tags: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        """相似性搜索"""
        if USE_REAL_DB and self._table:
            try:
                # LanceDB 向量搜索
                results = (
                    self._table.search(query_embedding)
                    .metric("cosine")
                    .limit(top_k)
                )

                if filter_tags:
                    tag_filter = " OR ".join([f"array_contains(tags, '{t}')" for t in filter_tags])
                    results = results.where(tag_filter)

                return results.to_list()

            except Exception as e:
                logger.error(f"Search error: {e}")
                return []
        else:
            # Mock 搜索（余弦相似度）
            global _mock_store

            if not _mock_store:
                return []

            query_vec = np.array(query_embedding)
            results = []

            for record in _mock_store:
                emb_vec = np.array(record["embedding"])
                similarity = np.dot(query_vec, emb_vec) / (
                    np.linalg.norm(query_vec) * np.linalg.norm(emb_vec)
                )

                # 标签过滤
                if filter_tags and not any(t in record["tags"] for t in filter_tags):
                    continue

                results.append({
                    **record,
                    "_similarity": float(similarity),
                })

            # 排序并取 top_k
            results.sort(key=lambda x: x["_similarity"], reverse=True)
            return results[:top_k]

    def text_search(self, query: str, top_k: int = 5) -> list[dict[str, Any]]:
        """文本搜索（基于文本字段的模糊匹配）"""
        if USE_REAL_DB and self._table:
            # LanceDB 全文搜索（如果启用）
            try:
                results = self._table.search(query).limit(top_k)
                return results.to_list()
            except:
                # 回退到向量搜索（需要先 embed query）
                return []
        else:
            # Mock 文本搜索
            global _mock_store
            query_lower = query.lower()
            results = []

            for record in _mock_store:
                score = 0.0
                if query_lower in record.get("text", "").lower():
                    score += 1.0
                for tag in record.get("tags", []):
                    if query_lower in tag.lower():
                        score += 0.5

                if score > 0:
                    results.append({**record, "_text_score": score})

            results.sort(key=lambda x: x["_text_score"], reverse=True)
            return results[:top_k]


# 全局存储实例
_store: VisionMemoryStore | None = None


def get_store() -> VisionMemoryStore:
    """获取全局存储"""
    global _store
    if _store is None:
        _store = VisionMemoryStore()
        _store.init()
    return _store


# ============================================================================
# RPC 方法
# ============================================================================


async def store(
    image_path: str,
    embedding: list[float],
    text: str = "",
    tags: list[str] | None = None,
    source: str = "api",
) -> dict[str, Any]:
    """
    存储图像到视觉记忆

    Args:
        image_path: 图像路径
        embedding: 嵌入向量
        text: 关联文本
        tags: 标签列表
        source: 来源

    Returns:
        存储的记录
    """
    start = time.time()

    try:
        store_instance = get_store()
        record = store_instance.store(
            image_path=image_path,
            embedding=embedding,
            text=text,
            tags=tags,
            source=source,
        )

        return {
            "success": True,
            "record": record,
            "latency_ms": int((time.time() - start) * 1000),
        }

    except Exception as e:
        logger.error(f"Store error: {e}")
        return {
            "success": False,
            "error": str(e),
            "latency_ms": int((time.time() - start) * 1000),
        }


async def search(
    query_embedding: list[float],
    top_k: int = 5,
    filter_tags: list[str] | None = None,
) -> dict[str, Any]:
    """
    向量相似性搜索

    Args:
        query_embedding: 查询嵌入向量
        top_k: 返回结果数量
        filter_tags: 标签过滤

    Returns:
        搜索结果列表
    """
    start = time.time()

    try:
        store_instance = get_store()
        results = store_instance.search(
            query_embedding=query_embedding,
            top_k=top_k,
            filter_tags=filter_tags,
        )

        return {
            "success": True,
            "count": len(results),
            "results": results,
            "latency_ms": int((time.time() - start) * 1000),
        }

    except Exception as e:
        logger.error(f"Search error: {e}")
        return {
            "success": False,
            "error": str(e),
            "latency_ms": int((time.time() - start) * 1000),
        }


async def query(
    query_text: str,
    top_k: int = 5,
    embed_first: bool = True,
) -> dict[str, Any]:
    """
    文本查询（自动嵌入后搜索）

    Args:
        query_text: 查询文本
        top_k: 返回数量
        embed_first: 是否先嵌入再搜索

    Returns:
        搜索结果
    """
    start = time.time()

    try:
        if embed_first:
            # 先嵌入查询文本
            from . import embed

            embed_result = await embed.text(query_text)

            if "error" in embed_result:
                return {
                    "success": False,
                    "error": f"Embedding failed: {embed_result['error']}",
                    "latency_ms": int((time.time() - start) * 1000),
                }

            query_embedding = embed_result["embedding"]

            # 向量搜索
            search_result = await search(query_embedding, top_k)
            search_result["query_embedded"] = True
            return search_result
        else:
            # 直接文本搜索
            store_instance = get_store()
            results = store_instance.text_search(query_text, top_k)

            return {
                "success": True,
                "count": len(results),
                "results": results,
                "query_embedded": False,
                "latency_ms": int((time.time() - start) * 1000),
            }

    except Exception as e:
        logger.error(f"Query error: {e}")
        return {
            "success": False,
            "error": str(e),
            "latency_ms": int((time.time() - start) * 1000),
        }


async def list_all(limit: int = 100) -> dict[str, Any]:
    """列出所有存储的记忆"""
    if USE_REAL_DB:
        try:
            store_instance = get_store()
            # 这里需要实际查询所有记录
            return {"success": True, "count": 0, "records": []}
        except Exception as e:
            return {"success": False, "error": str(e)}
    else:
        global _mock_store
        return {
            "success": True,
            "count": len(_mock_store),
            "records": _mock_store[:limit],
        }


# ============================================================================
# Sprint 6-B5: Video Chapter 存储
# ============================================================================

async def store_video_chapter(
    video_path: str,
    chapter_idx: int,
    start_time: float,
    end_time: float,
    frame_path: str,
    summary: str,
    embedding: list[float] | None = None,
    session_id: str | None = None,
) -> dict[str, Any]:
    """
    存储视频 chapter 到视觉记忆

    Args:
        video_path: 视频文件路径
        chapter_idx: chapter 索引
        start_time: 开始时间（秒）
        end_time: 结束时间（秒）
        frame_path: 关键帧路径
        summary: chapter 摘要
        embedding: 嵌入向量（可选，不传则自动计算）
        session_id: session ID

    Returns:
        存储结果
    """
    start = time.time()

    try:
        # 如果没有提供 embedding，自动计算
        if embedding is None:
            from . import embed

            embed_result = await embed.image(frame_path)
            embedding = embed_result.get("embedding")

            if embedding is None:
                return {
                    "success": False,
                    "error": "Failed to generate embedding for chapter frame",
                    "latency_ms": int((time.time() - start) * 1000),
                }

        # 构建记录
        store_instance = get_store()
        record = store_instance.store(
            image_path=frame_path,
            embedding=embedding,
            text=summary,
            tags=["video_chapter", f"session:{session_id or 'unknown'}", f"chapter:{chapter_idx}"],
            source="video_summarize",
        )

        # 添加额外字段
        record["kind"] = "video_chapter"
        record["video_path"] = video_path
        record["chapter_idx"] = chapter_idx
        record["start_time"] = start_time
        record["end_time"] = end_time
        record["session_id"] = session_id

        return {
            "success": True,
            "record": record,
            "chapter_idx": chapter_idx,
            "latency_ms": int((time.time() - start) * 1000),
        }

    except Exception as e:
        logger.error(f"Store video chapter error: {e}")
        return {
            "success": False,
            "error": str(e),
            "latency_ms": int((time.time() - start) * 1000),
        }


async def search_video_chapters(
    query: str,
    session_id: str | None = None,
    top_k: int = 3,
) -> dict[str, Any]:
    """
    搜索视频 chapters

    Args:
        query: 查询文本
        session_id: 可选，限定 session
        top_k: 返回数量

    Returns:
        匹配的 chapters
    """
    start = time.time()

    try:
        # 先嵌入查询
        from . import embed

        embed_result = await embed.text(query)
        query_embedding = embed_result.get("embedding")

        if query_embedding is None:
            return {
                "success": False,
                "error": "Failed to embed query",
                "latency_ms": int((time.time() - start) * 1000),
            }

        # 搜索
        store_instance = get_store()

        if USE_REAL_DB:
            # 使用 LanceDB 搜索，带标签过滤
            filter_tags = ["video_chapter"]
            if session_id:
                filter_tags.append(f"session:{session_id}")
            results = store_instance.search(query_embedding, top_k=top_k, filter_tags=filter_tags)
        else:
            # Mock 搜索，过滤 video_chapter
            global _mock_store
            query_vec = np.array(query_embedding)
            results = []

            for record in _mock_store:
                if "video_chapter" not in record.get("tags", []):
                    continue
                if session_id and f"session:{session_id}" not in record.get("tags", []):
                    continue

                emb_vec = np.array(record["embedding"])
                similarity = np.dot(query_vec, emb_vec) / (
                    np.linalg.norm(query_vec) * np.linalg.norm(emb_vec)
                )
                results.append({**record, "_similarity": float(similarity)})

            results.sort(key=lambda x: x["_similarity"], reverse=True)
            results = results[:top_k]

        return {
            "success": True,
            "count": len(results),
            "chapters": results,
            "latency_ms": int((time.time() - start) * 1000),
        }

    except Exception as e:
        logger.error(f"Search video chapters error: {e}")
        return {
            "success": False,
            "error": str(e),
            "latency_ms": int((time.time() - start) * 1000),
        }


# ============================================================================
# Sprint 7-C5: Late-Interaction MaxSim Retrieval (ColPali/VisRAG style)
# ============================================================================

def _maxsim_similarity(
    query_patches: list[list[float]],
    doc_patches: list[list[float]],
) -> float:
    """
    计算 MaxSim 相似度 (Late-Interaction)

    算法:
    对于 query 的每个 patch，找到 doc patches 中最相似的（max）
    然后对所有 query patches 取平均（sum）

    参考: ColPali paper
    """
    if not query_patches or not doc_patches:
        return 0.0

    total_sim = 0.0

    for q_patch in query_patches:
        q_vec = np.array(q_patch)
        # 找到最相似的 doc patch
        max_sim = -1.0
        for d_patch in doc_patches:
            d_vec = np.array(d_patch)
            sim = np.dot(q_vec, d_vec) / (np.linalg.norm(q_vec) * np.linalg.norm(d_vec))
            max_sim = max(max_sim, sim)
        total_sim += max_sim

    # 平均（也可求和，看具体配置）
    return total_sim / len(query_patches)


async def search_with_maxsim(
    query_text: str,
    doc_filter: dict[str, Any] | None = None,
    top_k: int = 5,
) -> dict[str, Any]:
    """
    使用 MaxSim (late-interaction) 检索文档

    Args:
        query_text: 查询文本
        doc_filter: 过滤条件 {doc_id, region_kind, ...}
        top_k: 返回结果数

    Returns:
        {
            "results": [{doc_id, page_idx, region, maxsim_score, ...}],
            "total_candidates": int,
            "latency_ms": int,
        }
    """
    start = time.time()

    try:
        # 1. 嵌入查询为 patches
        from . import embed

        query_embed_result = await embed.colqwen2(
            image_path="",  # 对于文本查询，需要先嵌入文本
            mode="patches",
        )

        if "error" in query_embed_result:
            # 回退到普通文本嵌入
            text_embed = await embed.text(query_text)
            query_patches = [text_embed.get("embedding", [])]
        else:
            query_patches = query_embed_result.get("embeddings", [])

        # 2. 获取候选文档（带过滤）
        store_instance = get_store()

        if USE_REAL_DB:
            # 使用 LanceDB 过滤
            # 注意: 需要 schema 支持 patch_embeddings 字段
            candidates = []  # 实际查询
        else:
            # Mock: 从全局存储中筛选文档类型的记录
            global _mock_store
            candidates = []

            for record in _mock_store:
                # 过滤文档类型
                if record.get("kind") not in ["doc_page", "figure", "chart", "table"]:
                    continue

                # 应用额外过滤
                if doc_filter:
                    if "doc_id" in doc_filter and record.get("doc_id") != doc_filter["doc_id"]:
                        continue
                    if "region_kind" in doc_filter and record.get("region_kind") != doc_filter["region_kind"]:
                        continue
                    if "page_idx" in doc_filter and record.get("page_idx") != doc_filter["page_idx"]:
                        continue

                candidates.append(record)

        # 3. 对每个候选计算 MaxSim
        scored_results = []

        for candidate in candidates:
            doc_patches = candidate.get("patch_embeddings")

            if not doc_patches:
                # 回退: 使用普通 embedding
                single_emb = candidate.get("embedding", [])
                if single_emb:
                    doc_patches = [single_emb]
                else:
                    continue

            score = _maxsim_similarity(query_patches, doc_patches)

            scored_results.append({
                "record": candidate,
                "maxsim_score": float(score),
            })

        # 4. 排序并返回 top_k
        scored_results.sort(key=lambda x: x["maxsim_score"], reverse=True)
        top_results = scored_results[:top_k]

        return {
            "success": True,
            "results": [
                {
                    "doc_id": r["record"].get("doc_id"),
                    "page_idx": r["record"].get("page_idx"),
                    "region_kind": r["record"].get("region_kind"),
                    "image_path": r["record"].get("image_path"),
                    "text": r["record"].get("text", "")[:200],
                    "maxsim_score": r["maxsim_score"],
                }
                for r in top_results
            ],
            "total_candidates": len(candidates),
            "latency_ms": int((time.time() - start) * 1000),
        }

    except Exception as e:
        logger.error(f"MaxSim search error: {e}")
        return {
            "success": False,
            "error": str(e),
            "latency_ms": int((time.time() - start) * 1000),
        }


# ============================================================================
# Sprint 7-C4/C5: Multi-modal Document RAG Storage
# ============================================================================

async def store_document_region(
    doc_id: str,
    page_idx: int,
    region_kind: str,  # text/figure/chart/table
    image_path: str,
    caption: str = "",
    patch_embeddings: list[list[float]] | None = None,
    source_path: str = "",
    bbox: list[float] | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    存储文档区域到多模态 RAG

    Args:
        doc_id: 文档 ID
        page_idx: 页码
        region_kind: 区域类型
        image_path: 区域图像路径
        caption: 语义描述（由 ChartGemma/Table-LLaVA 生成）
        patch_embeddings: ColQwen2 patch embeddings
        source_path: 原始文档路径
        bbox: 边界框 [x1,y1,x2,y2]
        metadata: 额外元数据

    Returns:
        存储结果
    """
    start = time.time()

    try:
        # 如果没有 patch embeddings，自动生成
        if patch_embeddings is None:
            from . import embed

            embed_result = await embed.colqwen2(image_path, mode="patches")

            if "error" in embed_result:
                # 回退到普通嵌入
                simple_embed = await embed.image(image_path)
                patch_embeddings = [simple_embed.get("embedding", [])]
            else:
                patch_embeddings = embed_result.get("embeddings", [])

        # 存储记录
        store_instance = get_store()

        # 计算平均嵌入（用于传统检索）
        avg_embedding = [sum(col) / len(col) for col in zip(*patch_embeddings)] if patch_embeddings else []

        record = store_instance.store(
            image_path=image_path,
            embedding=avg_embedding,
            text=caption,
            tags=[
                "doc_region",
                f"doc:{doc_id}",
                f"page:{page_idx}",
                f"kind:{region_kind}",
            ],
            source="doc_rag",
        )

        # 添加文档特有的字段
        record["doc_id"] = doc_id
        record["page_idx"] = page_idx
        record["region_kind"] = region_kind
        record["patch_embeddings"] = patch_embeddings
        record["caption"] = caption
        record["source_path"] = source_path
        record["bbox"] = bbox or []
        record["kind"] = "doc_region"
        record["metadata"] = metadata or {}

        return {
            "success": True,
            "record_id": record["id"],
            "doc_id": doc_id,
            "page_idx": page_idx,
            "region_kind": region_kind,
            "latency_ms": int((time.time() - start) * 1000),
        }

    except Exception as e:
        logger.error(f"Store document region error: {e}")
        return {
            "success": False,
            "error": str(e),
            "latency_ms": int((time.time() - start) * 1000),
        }


async def query_document(
    query: str,
    doc_id: str | None = None,
    top_k: int = 3,
    use_maxsim: bool = True,
) -> dict[str, Any]:
    """
    查询多模态文档

    Args:
        query: 查询问题
        doc_id: 可选，限定特定文档
        top_k: 返回结果数
        use_maxsim: 是否使用 MaxSim 检索

    Returns:
        {
            "answer": str,  # 由 VLM 基于检索结果生成
            "sources": [{page, region, caption, score}],
            "retrieval_method": str,
        }
    """
    start = time.time()

    # 1. 检索相关区域
    if use_maxsim:
        search_result = await search_with_maxsim(
            query,
            doc_filter={"doc_id": doc_id} if doc_id else None,
            top_k=top_k,
        )
    else:
        # 使用传统向量搜索
        from . import embed

        query_embed = await embed.text(query)
        store_instance = get_store()

        # Mock 搜索
        global _mock_store
        results = []
        for r in _mock_store:
            if r.get("kind") != "doc_region":
                continue
            if doc_id and r.get("doc_id") != doc_id:
                continue
            results.append({
                "doc_id": r.get("doc_id"),
                "page_idx": r.get("page_idx"),
                "region_kind": r.get("region_kind"),
                "image_path": r.get("image_path"),
                "text": r.get("caption", "")[:200],
                "maxsim_score": 0.75,  # 模拟分数
            })
        search_result = {"success": True, "results": results[:top_k]}

    if not search_result.get("success"):
        return {
            "answer": f"检索失败: {search_result.get('error')}",
            "sources": [],
        }

    sources = search_result.get("results", [])

    # 2. 生成答案（Mock 或真实 VLM）
    # 真实实现: 把检索到的 regions 喂给 VLM
    answer = f"根据文档检索结果: {query}\n\n"
    for s in sources:
        answer += f"- Page {s['page_idx']} ({s['region_kind']}): {s['text'][:100]}...\n"

    return {
        "answer": answer,
        "sources": sources,
        "retrieval_method": "maxsim" if use_maxsim else "standard",
        "latency_ms": int((time.time() - start) * 1000),
    }
