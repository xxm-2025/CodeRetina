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
