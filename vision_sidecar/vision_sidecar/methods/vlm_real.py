"""
视觉语言模型 (VLM) 真实实现

支持的模型:
- Moondream 2 (轻量, 2B, 适合CPU)
- MiniCPM-V 2.6 (高性能, 8B, 需GPU/大内存)

Sprint: S1-2
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any, Protocol

from PIL import Image

logger = logging.getLogger(__name__)


class VLMModel(Protocol):
    """VLM 模型协议"""

    async def caption(self, image: Image.Image, prompt: str = "") -> tuple[str, float]:
        """生成图像描述，返回(文本, 置信度)"""
        ...

    async def query(self, image: Image.Image, question: str) -> tuple[str, float]:
        """视觉问答，返回(回答, 置信度)"""
        ...

    async def detect(
        self, image: Image.Image, target: str | None = None
    ) -> list[dict[str, Any]]:
        """目标检测，返回边界框列表"""
        ...


class MoondreamModel:
    """
    Moondream 2 模型包装

    特点:
    - 2B 参数，INT8 量化后约 2GB
    - 可在 CPU/Apple Silicon 上流畅运行
    - 支持 caption, query, detect
    """

    def __init__(self, model_id: str = "vikhyatk/moondream2", device: str | None = None):
        self.model_id = model_id
        self.device = device or self._auto_device()
        self._model: Any = None
        self._tokenizer: Any = None
        self._loaded = False

    def _auto_device(self) -> str:
        """自动选择设备"""
        try:
            import torch

            if torch.cuda.is_available():
                return "cuda"
            elif torch.backends.mps.is_available():
                return "mps"
        except ImportError:
            pass
        return "cpu"

    def load(self) -> None:
        """加载模型"""
        if self._loaded:
            return

        logger.info(f"Loading Moondream model: {self.model_id} on {self.device}")
        start = time.time()

        try:
            from transformers import AutoModelForCausalLM, AutoTokenizer

            self._tokenizer = AutoTokenizer.from_pretrained(
                self.model_id, trust_remote_code=True
            )
            self._model = AutoModelForCausalLM.from_pretrained(
                self.model_id,
                trust_remote_code=True,
                device_map={"": self.device},
            )
            self._model.eval()
            self._loaded = True

            logger.info(f"Moondream loaded in {time.time() - start:.2f}s")
        except Exception as e:
            logger.error(f"Failed to load Moondream: {e}")
            raise

    async def caption(self, image: Image.Image, prompt: str = "") -> tuple[str, float]:
        """生成图像描述"""
        if not self._loaded:
            self.load()

        try:
            # Moondream 编码图像
            enc_image = self._model.encode_image(image)

            # 生成描述
            prompt_text = prompt if prompt else "Describe this image."
            answer = self._model.answer_question(enc_image, prompt_text, self._tokenizer)

            # Moondream 不直接提供置信度，使用启发式估计
            confidence = 0.85  # 默认置信度

            return answer, confidence
        except Exception as e:
            logger.error(f"Caption error: {e}")
            return f"[Error generating caption: {e}]", 0.0

    async def query(self, image: Image.Image, question: str) -> tuple[str, float]:
        """视觉问答"""
        if not self._loaded:
            self.load()

        try:
            enc_image = self._model.encode_image(image)
            answer = self._model.answer_question(enc_image, question, self._tokenizer)
            return answer, 0.82
        except Exception as e:
            logger.error(f"Query error: {e}")
            return f"[Error answering: {e}]", 0.0

    async def detect(
        self, image: Image.Image, target: str | None = None
    ) -> list[dict[str, Any]]:
        """目标检测（使用 Moondream 的 pointing 能力）"""
        if not self._loaded:
            self.load()

        try:
            enc_image = self._model.encode_image(image)

            # 使用 pointing 提示词
            target_str = target or "objects"
            query = f"Point to the {target_str} in the image."

            # 调用 Moondream 的 point 功能
            points = self._model.point(enc_image, query, self._tokenizer)

            # 转换为标准框格式
            boxes = []
            if points and len(points) > 0:
                for pt in points:
                    # 点转换为小框（近似）
                    x, y = pt.get("x", 0.5), pt.get("y", 0.5)
                    boxes.append(
                        {
                            "x": int(x * image.width) - 25,
                            "y": int(y * image.height) - 25,
                            "width": 50,
                            "height": 50,
                            "label": target or "object",
                            "confidence": 0.75,
                        }
                    )

            return boxes
        except Exception as e:
            logger.error(f"Detect error: {e}")
            return []


class MiniCPMVModel:
    """
    MiniCPM-V 2.6 模型包装

    特点:
    - 8B 参数，性能接近 GPT-4V
    - 需要 GPU 或 24GB+ 内存
    - 支持多图、OCR、 grounding
    """

    def __init__(self, model_id: str = "openbmb/MiniCPM-V-2_6", device: str | None = None):
        self.model_id = model_id
        self.device = device or self._auto_device()
        self._model: Any = None
        self._tokenizer: Any = None
        self._loaded = False

    def _auto_device(self) -> str:
        """自动选择设备"""
        try:
            import torch

            if torch.cuda.is_available():
                return "cuda"
            elif torch.backends.mps.is_available():
                return "mps"
        except ImportError:
            pass
        return "cpu"

    def load(self) -> None:
        """加载模型"""
        if self._loaded:
            return

        logger.info(f"Loading MiniCPM-V model: {self.model_id} on {self.device}")
        start = time.time()

        try:
            from transformers import AutoModel, AutoTokenizer

            self._model = AutoModel.from_pretrained(
                self.model_id,
                trust_remote_code=True,
                attn_implementation="sdpa",
                torch_dtype="auto",
                device_map={"": self.device},
            )
            self._tokenizer = AutoTokenizer.from_pretrained(
                self.model_id, trust_remote_code=True
            )
            self._model.eval()
            self._loaded = True

            logger.info(f"MiniCPM-V loaded in {time.time() - start:.2f}s")
        except Exception as e:
            logger.error(f"Failed to load MiniCPM-V: {e}")
            raise

    async def caption(self, image: Image.Image, prompt: str = "") -> tuple[str, float]:
        """生成图像描述"""
        if not self._loaded:
            self.load()

        try:
            # 准备对话
            default_prompt = "Describe this image in detail."
            question = prompt if prompt else default_prompt

            msgs = [{"role": "user", "content": [image, question]}]

            # 生成
            res = self._model.chat(
                image=None,
                msgs=msgs,
                tokenizer=self._tokenizer,
                sampling=True,
                temperature=0.7,
            )

            # MiniCPM-V 通常质量较高
            confidence = 0.9

            return res, confidence
        except Exception as e:
            logger.error(f"Caption error: {e}")
            return f"[Error generating caption: {e}]", 0.0

    async def query(self, image: Image.Image, question: str) -> tuple[str, float]:
        """视觉问答"""
        if not self._loaded:
            self.load()

        try:
            msgs = [{"role": "user", "content": [image, question]}]

            res = self._model.chat(
                image=None,
                msgs=msgs,
                tokenizer=self._tokenizer,
                sampling=True,
                temperature=0.5,
            )

            return res, 0.88
        except Exception as e:
            logger.error(f"Query error: {e}")
            return f"[Error answering: {e}]", 0.0

    async def detect(
        self, image: Image.Image, target: str | None = None
    ) -> list[dict[str, Any]]:
        """目标检测（使用 grounding 能力）"""
        if not self._loaded:
            self.load()

        try:
            target_str = target or "objects"
            question = f"Locate the {target_str} in the image and provide bounding boxes."

            msgs = [{"role": "user", "content": [image, question]}]

            res = self._model.chat(
                image=None,
                msgs=msgs,
                tokenizer=self._tokenizer,
                sampling=False,
            )

            # 解析 grounding 输出
            # MiniCPM-V 会返回 <box>...</box> 格式
            boxes = self._parse_grounding_output(res, image.width, image.height)

            return boxes
        except Exception as e:
            logger.error(f"Detect error: {e}")
            return []

    def _parse_grounding_output(
        self, text: str, img_width: int, img_height: int
    ) -> list[dict[str, Any]]:
        """解析 grounding 输出中的边界框"""
        import re

        boxes = []
        # 匹配 <box>[[x1,y1,x2,y2]]</box> 格式
        pattern = r"<box>\[\[(\d+),(\d+),(\d+),(\d+)\]\]</box>"

        for match in re.finditer(pattern, text):
            x1, y1, x2, y2 = map(int, match.groups())
            boxes.append(
                {
                    "x": x1,
                    "y": y1,
                    "width": x2 - x1,
                    "height": y2 - y1,
                    "label": "object",
                    "confidence": 0.85,
                }
            )

        return boxes


class VLMManager:
    """
    VLM 模型管理器

    管理多个模型的加载和生命周期。
    """

    def __init__(self):
        self._models: dict[str, VLMModel] = {}
        self._current_model: str | None = None

    def get_model(self, model_name: str) -> VLMModel:
        """获取或创建模型实例"""
        if model_name not in self._models:
            if model_name.startswith("moondream"):
                self._models[model_name] = MoondreamModel()
            elif model_name.startswith("minicpm"):
                self._models[model_name] = MiniCPMVModel()
            else:
                raise ValueError(f"Unknown model: {model_name}")

        return self._models[model_name]

    def unload_all(self) -> None:
        """卸载所有模型（释放显存）"""
        import gc

        try:
            import torch

            for model in self._models.values():
                if hasattr(model, "_model") and model._model is not None:
                    del model._model

            self._models.clear()
            torch.cuda.empty_cache()
            gc.collect()

            logger.info("All models unloaded")
        except Exception as e:
            logger.error(f"Error unloading models: {e}")


# 全局管理器实例
_manager: VLMManager | None = None


def get_manager() -> VLMManager:
    """获取全局 VLM 管理器"""
    global _manager
    if _manager is None:
        _manager = VLMManager()
    return _manager
