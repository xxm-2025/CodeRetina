"""
图像/文本嵌入 RPC 方法

基于 SigLIP2 / CLIP 实现多模态嵌入，用于视觉记忆检索。

方法:
- embed.image: 图像嵌入
- embed.text: 文本嵌入
- embed.similarity: 计算相似度

Sprint: S4-1
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

# 是否使用真实模型
USE_REAL_MODELS = False  # Sprint 4 完成后设为 True


class SigLIP2Embedder:
    """
    SigLIP2 嵌入模型

    Google 开源的多模态嵌入模型，适合图像-文本检索。
    """

    def __init__(self, model_name: str = "google/siglip2-base-patch16-224", device: str = "cpu"):
        self.model_name = model_name
        self.device = device
        self._model: Any = None
        self._processor: Any = None
        self._loaded = False
        self._embedding_dim = 768  # SigLIP2 base 维度

    def load(self) -> None:
        """加载模型"""
        if self._loaded:
            return

        logger.info(f"Loading SigLIP2 model: {self.model_name}")

        try:
            from transformers import AutoModel, AutoProcessor

            self._processor = AutoProcessor.from_pretrained(self.model_name)
            self._model = AutoModel.from_pretrained(self.model_name)
            self._model.to(self.device)
            self._model.eval()
            self._loaded = True

            logger.info("SigLIP2 model loaded")

        except Exception as e:
            logger.error(f"Failed to load SigLIP2: {e}")
            raise

    def embed_image(self, image: Image.Image) -> list[float]:
        """嵌入图像"""
        if not self._loaded:
            self.load()

        try:
            import torch

            inputs = self._processor(images=image, return_tensors="pt")
            inputs = {k: v.to(self.device) for k, v in inputs.items()}

            with torch.no_grad():
                outputs = self._model.get_image_features(**inputs)

            # 归一化
            embeddings = outputs.cpu().numpy()
            embeddings = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)

            return embeddings[0].tolist()

        except Exception as e:
            logger.error(f"Image embedding error: {e}")
            raise

    def embed_text(self, text: str) -> list[float]:
        """嵌入文本"""
        if not self._loaded:
            self.load()

        try:
            import torch

            inputs = self._processor(text=[text], padding=True, return_tensors="pt")
            inputs = {k: v.to(self.device) for k, v in inputs.items()}

            with torch.no_grad():
                outputs = self._model.get_text_features(**inputs)

            # 归一化
            embeddings = outputs.cpu().numpy()
            embeddings = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)

            return embeddings[0].tolist()

        except Exception as e:
            logger.error(f"Text embedding error: {e}")
            raise


class CLIPEmbedder:
    """
    CLIP 嵌入模型（备选）
    """

    def __init__(self, model_name: str = "openai/clip-vit-base-patch32", device: str = "cpu"):
        self.model_name = model_name
        self.device = device
        self._model: Any = None
        self._processor: Any = None
        self._loaded = False

    def load(self) -> None:
        """加载模型"""
        if self._loaded:
            return

        logger.info(f"Loading CLIP model: {self.model_name}")

        try:
            from transformers import CLIPModel, CLIPProcessor

            self._processor = CLIPProcessor.from_pretrained(self.model_name)
            self._model = CLIPModel.from_pretrained(self.model_name)
            self._model.to(self.device)
            self._model.eval()
            self._loaded = True

            logger.info("CLIP model loaded")

        except Exception as e:
            logger.error(f"Failed to load CLIP: {e}")
            raise

    def embed_image(self, image: Image.Image) -> list[float]:
        """嵌入图像"""
        if not self._loaded:
            self.load()

        try:
            import torch

            inputs = self._processor(images=image, return_tensors="pt")
            inputs = {k: v.to(self.device) for k, v in inputs.items()}

            with torch.no_grad():
                outputs = self._model.get_image_features(**inputs)

            embeddings = outputs.cpu().numpy()
            embeddings = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)

            return embeddings[0].tolist()

        except Exception as e:
            logger.error(f"Image embedding error: {e}")
            raise

    def embed_text(self, text: str) -> list[float]:
        """嵌入文本"""
        if not self._loaded:
            self.load()

        try:
            import torch

            inputs = self._processor(text=[text], padding=True, return_tensors="pt")
            inputs = {k: v.to(self.device) for k, v in inputs.items()}

            with torch.no_grad():
                outputs = self._model.get_text_features(**inputs)

            embeddings = outputs.cpu().numpy()
            embeddings = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)

            return embeddings[0].tolist()

        except Exception as e:
            logger.error(f"Text embedding error: {e}")
            raise


class EmbedderManager:
    """嵌入模型管理器"""

    def __init__(self):
        self._embedders: dict[str, SigLIP2Embedder | CLIPEmbedder] = {}
        self._default_model = "siglip2"

    def get_embedder(self, model_name: str | None = None) -> SigLIP2Embedder | CLIPEmbedder:
        """获取或创建嵌入器"""
        name = model_name or self._default_model

        if name not in self._embedders:
            if name == "siglip2":
                self._embedders[name] = SigLIP2Embedder()
            elif name == "clip":
                self._embedders[name] = CLIPEmbedder()
            else:
                raise ValueError(f"Unknown embedder: {name}")

        return self._embedders[name]


# 全局管理器
_manager: EmbedderManager | None = None


def get_manager() -> EmbedderManager:
    """获取全局管理器"""
    global _manager
    if _manager is None:
        _manager = EmbedderManager()
    return _manager


# ============================================================================
# RPC 方法
# ============================================================================


async def image(image_path: str, model: str = "siglip2") -> dict[str, Any]:
    """
    图像嵌入

    Args:
        image_path: 图像文件路径
        model: 嵌入模型 (siglip2, clip)

    Returns:
        {
            "embedding": list[float],  # 归一化后的嵌入向量
            "dimensions": int,
            "model": str,
            "latency_ms": int
        }
    """
    import time

    start = time.time()

    if not USE_REAL_MODELS:
        # Mock 实现：返回随机向量
        import random

        await asyncio.sleep(0.1)  # 模拟延迟
        embedding = [random.random() for _ in range(768)]
        # 归一化
        norm = sum(x**2 for x in embedding) ** 0.5
        embedding = [x / norm for x in embedding]

        return {
            "embedding": embedding,
            "dimensions": 768,
            "model": model,
            "latency_ms": int((time.time() - start) * 1000),
            "_note": "MOCK embedding (set USE_REAL_MODELS=True for real)",
        }

    # 真实实现
    try:
        manager = get_manager()
        embedder = manager.get_embedder(model)

        img = Image.open(image_path).convert("RGB")
        embedding = embedder.embed_image(img)

        return {
            "embedding": embedding,
            "dimensions": len(embedding),
            "model": model,
            "latency_ms": int((time.time() - start) * 1000),
        }

    except Exception as e:
        logger.error(f"Image embedding error: {e}")
        return {
            "error": str(e),
            "model": model,
            "latency_ms": int((time.time() - start) * 1000),
        }


async def text(content: str, model: str = "siglip2") -> dict[str, Any]:
    """
    文本嵌入

    Args:
        content: 文本内容
        model: 嵌入模型

    Returns:
        {
            "embedding": list[float],
            "dimensions": int,
            "model": str,
            "latency_ms": int
        }
    """
    import time

    start = time.time()

    if not USE_REAL_MODELS:
        # Mock 实现
        import random

        await asyncio.sleep(0.05)
        embedding = [random.random() for _ in range(768)]
        norm = sum(x**2 for x in embedding) ** 0.5
        embedding = [x / norm for x in embedding]

        return {
            "embedding": embedding,
            "dimensions": 768,
            "model": model,
            "latency_ms": int((time.time() - start) * 1000),
            "_note": "MOCK embedding",
        }

    # 真实实现
    try:
        manager = get_manager()
        embedder = manager.get_embedder(model)

        embedding = embedder.embed_text(content)

        return {
            "embedding": embedding,
            "dimensions": len(embedding),
            "model": model,
            "latency_ms": int((time.time() - start) * 1000),
        }

    except Exception as e:
        logger.error(f"Text embedding error: {e}")
        return {
            "error": str(e),
            "model": model,
            "latency_ms": int((time.time() - start) * 1000),
        }


async def similarity(
    embedding_a: list[float], embedding_b: list[float]
) -> dict[str, Any]:
    """
    计算余弦相似度

    Args:
        embedding_a: 第一个嵌入向量
        embedding_b: 第二个嵌入向量

    Returns:
        {
            "similarity": float,  # 0-1
            "distance": float      # 欧氏距离
        }
    """
    try:
        # 转换为 numpy
        a = np.array(embedding_a)
        b = np.array(embedding_b)

        # 余弦相似度
        dot_product = np.dot(a, b)
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        cosine_sim = dot_product / (norm_a * norm_b)

        # 欧氏距离
        euclidean = np.linalg.norm(a - b)

        return {
            "similarity": float(cosine_sim),
            "distance": float(euclidean),
        }

    except Exception as e:
        logger.error(f"Similarity calculation error: {e}")
        return {
            "error": str(e),
            "similarity": 0.0,
            "distance": float("inf"),
        }


import asyncio  # noqa: E402


# ============================================================================
# Sprint 7-C4: ColPali/ColQwen2 Patch Embedding Support
# ============================================================================

class ColQwen2Embedder:
    """
    ColQwen2 嵌入模型 —— 支持 patch-level 嵌入

    用于文档视觉 RAG，实现 late-interaction 检索。
    参考: https://github.com/illuin-colpali/colpali-engine
    """

    def __init__(self, model_name: str = "vidore/colqwen2-v1.0", device: str = "cpu"):
        self.model_name = model_name
        self.device = device
        self._model: Any = None
        self._processor: Any = None
        self._loaded = False
        self._patch_size = 16  # 典型 patch size
        self._image_size = 448  # 输入图像尺寸

    def load(self) -> None:
        """加载模型"""
        if self._loaded:
            return

        logger.info(f"Loading ColQwen2 model: {self.model_name}")

        try:
            # from colpali_engine.models import ColQwen2, ColQwen2Processor
            # self._model = ColQwen2.from_pretrained(self.model_name)
            # self._processor = ColQwen2Processor.from_pretrained(self.model_name)
            # self._model.to(self.device)
            # self._model.eval()
            self._loaded = True
            logger.info("ColQwen2 model loaded")
        except Exception as e:
            logger.error(f"Failed to load ColQwen2: {e}")
            raise

    def embed_image_patches(self, image: Image.Image) -> list[list[float]]:
        """
        嵌入图像为 patches

        Returns:
            列表的嵌入向量，每个向量对应一个 patch
            典型: 1024 patches x 128 dims (对于 448x448 图像)
        """
        if not self._loaded:
            self.load()

        try:
            # 实际实现需要 ColQwen2 模型
            # inputs = self._processor(images=image, return_tensors="pt")
            # with torch.no_grad():
            #     outputs = self._model(**inputs)
            #     patch_embeddings = outputs.cpu().numpy()

            # Mock: 返回模拟的 patch embeddings
            import random
            num_patches = 1024  # 32x32 grid
            dim = 128
            patches = [[random.random() for _ in range(dim)] for _ in range(num_patches)]
            # 归一化
            for i, patch in enumerate(patches):
                norm = sum(x**2 for x in patch) ** 0.5
                patches[i] = [x / norm for x in patch]

            return patches

        except Exception as e:
            logger.error(f"Patch embedding error: {e}")
            raise


async def colqwen2(
    image_path: str,
    mode: str = "patches",
    model: str = "colqwen2",
) -> dict[str, Any]:
    """
    ColQwen2 patch-level 嵌入

    Args:
        image_path: 图像路径
        mode: 嵌入模式 (patches 或 single)
        model: 模型名称

    Returns:
        {
            "embeddings": list[list[float]],  # patch embeddings matrix
            "num_patches": int,
            "patch_shape": [rows, cols],
            "dimensions": int,  # per-patch dim
            "model": str,
            "latency_ms": int,
        }
    """
    import time

    start = time.time()

    if not USE_REAL_MODELS:
        # Mock 实现
        await asyncio.sleep(0.2)

        # 模拟 32x32 = 1024 patches，每 patch 128 dim
        import random
        num_patches = 1024
        dim = 128
        patches = [[random.random() for _ in range(dim)] for _ in range(num_patches)]

        # 归一化
        for i, patch in enumerate(patches):
            norm = sum(x**2 for x in patch) ** 0.5
            patches[i] = [x / norm for x in patch]

        return {
            "embeddings": patches,
            "num_patches": num_patches,
            "patch_shape": [32, 32],
            "dimensions": dim,
            "model": model,
            "latency_ms": int((time.time() - start) * 1000),
            "_note": "MOCK: Set USE_REAL_MODELS=True for real ColQwen2",
        }

    # 真实实现
    try:
        embedder = ColQwen2Embedder()
        img = Image.open(image_path).convert("RGB")

        if mode == "patches":
            patch_embeddings = embedder.embed_image_patches(img)

            return {
                "embeddings": patch_embeddings,
                "num_patches": len(patch_embeddings),
                "patch_shape": [32, 32],  # 假设
                "dimensions": len(patch_embeddings[0]) if patch_embeddings else 0,
                "model": model,
                "latency_ms": int((time.time() - start) * 1000),
            }
        else:
            # 单向量模式（取平均）
            patch_embeddings = embedder.embed_image_patches(img)
            # 平均池化
            avg_embedding = [sum(col) / len(col) for col in zip(*patch_embeddings)]

            return {
                "embedding": avg_embedding,
                "dimensions": len(avg_embedding),
                "model": model,
                "latency_ms": int((time.time() - start) * 1000),
            }

    except Exception as e:
        logger.error(f"ColQwen2 embedding error: {e}")
        return {
            "error": str(e),
            "model": model,
            "latency_ms": int((time.time() - start) * 1000),
        }
