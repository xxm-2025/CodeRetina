"""
YOLO 目标检测实现

基于 Ultralytics YOLOv8

Sprint: S1-3
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from PIL import Image

logger = logging.getLogger(__name__)


class YOLODetector:
    """
    YOLO 目标检测器

    支持:
    - YOLOv8 (n/s/m/l/x)
    - 自定义训练模型
    """

    # COCO 类别名称
    COCO_CLASSES = [
        "person",
        "bicycle",
        "car",
        "motorcycle",
        "airplane",
        "bus",
        "train",
        "truck",
        "boat",
        "traffic light",
        "fire hydrant",
        "stop sign",
        "parking meter",
        "bench",
        "bird",
        "cat",
        "dog",
        "horse",
        "sheep",
        "cow",
        "elephant",
        "bear",
        "zebra",
        "giraffe",
        "backpack",
        "umbrella",
        "handbag",
        "tie",
        "suitcase",
        "frisbee",
        "skis",
        "snowboard",
        "sports ball",
        "kite",
        "baseball bat",
        "baseball glove",
        "skateboard",
        "surfboard",
        "tennis racket",
        "bottle",
        "wine glass",
        "cup",
        "fork",
        "knife",
        "spoon",
        "bowl",
        "banana",
        "apple",
        "sandwich",
        "orange",
        "broccoli",
        "carrot",
        "hot dog",
        "pizza",
        "donut",
        "cake",
        "chair",
        "couch",
        "potted plant",
        "bed",
        "dining table",
        "toilet",
        "tv",
        "laptop",
        "mouse",
        "remote",
        "keyboard",
        "cell phone",
        "microwave",
        "oven",
        "toaster",
        "sink",
        "refrigerator",
        "book",
        "clock",
        "vase",
        "scissors",
        "teddy bear",
        "hair drier",
        "toothbrush",
    ]

    def __init__(self, model_name: str = "yolov8n.pt", device: str | None = None):
        """
        初始化检测器

        Args:
            model_name: YOLO 模型名称或路径
            device: 运行设备 (cuda/cpu/mps)
        """
        self.model_name = model_name
        self.device = device or self._auto_device()
        self._model: Any = None
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

        try:
            from ultralytics import YOLO

            logger.info(f"Loading YOLO model: {self.model_name} on {self.device}")

            # 自动下载模型（如果不存在）
            self._model = YOLO(self.model_name)

            # 预热模型
            self._warmup()

            self._loaded = True
            logger.info("YOLO model loaded")

        except Exception as e:
            logger.error(f"Failed to load YOLO: {e}")
            raise

    def _warmup(self) -> None:
        """模型预热"""
        try:
            import numpy as np

            # 创建虚拟图像进行预热
            dummy = np.zeros((640, 640, 3), dtype=np.uint8)
            self._model.predict(dummy, verbose=False, device=self.device)
        except Exception as e:
            logger.warning(f"Warmup failed: {e}")

    def detect(
        self,
        image_path: str,
        classes: list[str] | None = None,
        confidence: float = 0.5,
        iou: float = 0.45,
    ) -> dict[str, Any]:
        """
        执行目标检测

        Args:
            image_path: 图像路径
            classes: 要检测的类别列表（None 表示所有）
            confidence: 置信度阈值
            iou: IoU 阈值（NMS）

        Returns:
            检测结果字典
        """
        if not self._loaded:
            self.load()

        try:
            # 加载图像获取尺寸
            img = Image.open(image_path)
            img_width, img_height = img.size

            # 类别过滤
            class_ids = None
            if classes:
                class_ids = [self.COCO_CLASSES.index(c) for c in classes if c in self.COCO_CLASSES]

            # 运行检测
            results = self._model.predict(
                image_path,
                conf=confidence,
                iou=iou,
                classes=class_ids,
                device=self.device,
                verbose=False,
            )

            # 解析结果
            detections = []
            result = results[0]  # 单张图像

            if result.boxes is not None:
                boxes = result.boxes

                for i in range(len(boxes)):
                    box = boxes[i]
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                    conf = float(box.conf[0].cpu().numpy())
                    cls_id = int(box.cls[0].cpu().numpy())

                    detections.append(
                        {
                            "class": self.COCO_CLASSES[cls_id],
                            "confidence": round(conf, 3),
                            "box": {
                                "x1": round(float(x1) / img_width, 4),
                                "y1": round(float(y1) / img_height, 4),
                                "x2": round(float(x2) / img_width, 4),
                                "y2": round(float(y2) / img_height, 4),
                            },
                            "center": {
                                "x": round((float(x1) + float(x2)) / 2 / img_width, 4),
                                "y": round((float(y1) + float(y2)) / 2 / img_height, 4),
                            },
                        }
                    )

            return {
                "detections": detections,
                "count": len(detections),
                "model": self.model_name,
                "image_size": {"width": img_width, "height": img_height},
            }

        except Exception as e:
            logger.error(f"Detection error: {e}")
            return {
                "detections": [],
                "count": 0,
                "model": self.model_name,
                "error": str(e),
            }

    def detect_ui_elements(
        self,
        image_path: str,
        confidence: float = 0.3,
    ) -> dict[str, Any]:
        """
        检测 UI 相关元素

        专注于以下类别:
        - 显示器/屏幕 (tv, laptop)
        - 输入设备 (mouse, keyboard, cell phone)
        - 按钮/控件 (remote)
        - 文本相关 (book)
        """
        ui_classes = ["tv", "laptop", "mouse", "keyboard", "cell phone", "remote", "book"]
        return self.detect(image_path, classes=ui_classes, confidence=confidence)


# 全局检测器实例
_detector: YOLODetector | None = None


def get_detector(model_name: str = "yolov8n.pt") -> YOLODetector:
    """获取全局检测器实例"""
    global _detector
    if _detector is None:
        _detector = YOLODetector(model_name)
    return _detector
