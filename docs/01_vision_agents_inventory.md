# Vision-Agents 复用清单 —— Processor + Sidecar 融合分析

## 1. 文档信息

- **创建日期**: 2026-05-12
- **对应 Sprint**: Sprint 0 (S0-2)
- **文档目的**: 盘点 Vision-Agents 代码库，确定可复用的 Processor 和插件，为 Python Sidecar 设计提供依据

---

## 2. Vision-Agents 架构概览

```
Vision-Agents/
├── agents-core/              # 核心 Agent 框架（Python）
│   └── vision_agents/
│       ├── core/
│       │   ├── agents/       # Agent 生命周期管理
│       │   ├── processors/   # Processor 基类（可复用）
│       │   ├── llm/          # LLM 抽象与 Realtime API
│       │   ├── edge/         # WebRTC/音视频传输
│       │   ├── stt/          # 语音转文本
│       │   ├── tts/          # 文本转语音
│       │   └── utils/        # 视频/音频工具
│       └── testing/
└── plugins/                  # 可插拔的视觉/音频处理器
    ├── ultralytics/          # YOLO 目标检测
    ├── moondream/            # 轻量 VLM
    ├── anthropic/            # Claude API
    ├── gemini/               # Gemini API
    └── ...（其他插件）
```

---

## 3. 可复用组件清单

### 3.1 Processor 基类（强烈推荐复用）

**文件**: `agents-core/vision_agents/core/processors/base_processor.py`

```python
class Processor(abc.ABC):
    """所有音视频处理器的基类"""
    @property
    @abc.abstractmethod
    def name(self) -> str: ...
    
    @abc.abstractmethod
    async def close(self) -> None: ...

class VideoProcessor(Processor):
    """视频处理基类 —— 处理输入视频流"""
    @abc.abstractmethod
    async def process_video(self, track: VideoStreamTrack, 
                           participant_id: Optional[str]) -> None: ...

class VideoProcessorPublisher(VideoProcessor, VideoPublisher):
    """处理并发布视频（如：目标检测标注）"""
```

**复用建议**: 在 Sidecar 中继承这些基类，实现视觉处理流水线。

### 3.2 视频工具类（可复用）

**文件**: `agents-core/vision_agents/core/utils/`

| 文件 | 功能 | 复用建议 |
|------|------|----------|
| `video_forwarder.py` | 视频帧转发 | 复用，用于屏幕流处理 |
| `video_queue.py` | 视频帧队列 | 复用，用于缓冲屏幕帧 |
| `video_track.py` | 视频轨道抽象 | 复用，屏幕捕获可映射为 track |
| `video_utils.py` | 视频工具函数 | 部分复用，如格式转换 |
| `av_synchronizer.py` | 音视频同步 | 暂不复用（Live 模式再用） |

### 3.3 LLM 抽象（可选复用）

**文件**: `agents-core/vision_agents/core/llm/`

```python
class LLM(abc.ABC):
    """LLM 抽象基类"""
    async def generate(self, messages: list[dict]) -> str: ...

class Realtime(abc.ABC):
    """Realtime API 抽象（Gemini/OpenAI）"""
```

**复用建议**: 
- Sprint 1-3 暂不复用（直接调用 VLM API 更简单）
- Sprint 4 (Live 模式) 考虑复用 `Realtime` 基类

---

## 4. 视觉插件详细分析

### 4.1 ultralytics（YOLO 目标检测）

**路径**: `Vision-Agents/plugins/ultralytics/`

```python
from vision_agents.plugins.ultralytics import UltralyticsProcessor

class UltralyticsProcessor(VideoProcessorPublisher):
    """YOLO 目标检测处理器"""
    def __init__(self, model: str = "yolov8n.pt"): ...
    
    async def process_video(self, track, participant_id): ...
```

**复用价值**: ★★★★★
- 可直接用于 `UIParseTool` 的元素检测
- 支持自定义训练模型

### 4.2 moondream（轻量 VLM）

**路径**: `Vision-Agents/plugins/moondream/`

```python
from vision_agents.plugins.moondream import MoondreamProcessor

class MoondreamProcessor(VideoProcessor):
    """Moondream VLM 处理器"""
    def __init__(self, model_id: str = "vikhyatk/moondream2"): ...
```

**复用价值**: ★★★★★
- 本地 Tier 1 VLM 首选（2B 参数，可跑在笔记本）
- 支持 `caption`, `query`, `detect` 三种模式
- 直接用于 `VisionQATool` 后端

### 4.3 anthropic（Claude API）

**路径**: `Vision-Agents/plugins/anthropic/`

```python
from vision_agents.plugins.anthropic import AnthropicLLM
```

**复用价值**: ★★★☆☆
- 项目本身已用 TypeScript 调用 Claude
- Sidecar 中如需 Python 调用 Claude 可复用

### 4.4 gemini（Gemini API）

**路径**: `Vision-Agents/plugins/gemini/`

```python
from vision_agents.plugins.gemini import GeminiLLM, GeminiRealtime
```

**复用价值**: ★★★★☆
- Sprint 4 (Live 模式) 必须复用 `GeminiRealtime`
- 支持实时音视频流

---

## 5. Sidecar 复用清单汇总

### 5.1 Sprint 1 需要（视觉中台基础）

| 组件 | 来源 | 用途 | 优先级 |
|------|------|------|--------|
| `Processor` 基类 | `core/processors/` | Sidecar 处理器基类 | P0 |
| `MoondreamProcessor` | `plugins/moondream` | VisionQATool Tier 1 | P0 |
| `UltralyticsProcessor` | `plugins/ultralytics` | UIParseTool/YOLO | P1 |
| 视频工具函数 | `core/utils/video_*.py` | 帧处理 | P1 |

### 5.2 Sprint 2 需要（Browser + Screenshot）

| 组件 | 来源 | 用途 | 优先级 |
|------|------|------|--------|
| 图像处理工具 | `core/utils/` | BrowserVisionTool 后处理 | P1 |

### 5.3 Sprint 3 需要（GUI Agent）

| 组件 | 来源 | 用途 | 优先级 |
|------|------|------|--------|
| 屏幕捕获逻辑 | `core/utils/video_track.py` | GUI Agent 屏幕输入 | P1 |
| pyautogui 集成 | 需自建 | GUI 操作执行 | P0 |

### 5.4 Sprint 4 需要（Live 模式）

| 组件 | 来源 | 用途 | 优先级 |
|------|------|------|--------|
| `Agent` 类 | `core/agents/agents.py` | Live 模式编排 | P0 |
| `GeminiRealtime` | `plugins/gemini` | 实时音视频 | P0 |
| `VideoForwarder` | `core/utils/` | 屏幕流转发 | P1 |
| STT/TTS | `core/stt/, core/tts/` | 语音交互 | P1 |

---

## 6. Sidecar 架构建议

基于 Vision-Agents 的复用分析，建议 Sidecar 采用以下架构：

```python
# vision_sidecar/vision_sidecar/
├── server.py           # JSON-RPC stdio 服务器
├── registry.py         # 方法注册表（类似 Tool.ts）
├── processors/         # 包装 Vision-Agents 处理器
│   ├── vlm.py         # Moondream/MiniCPM-V 包装
│   ├── detect.py      # YOLO 包装
│   ├── ui_parse.py    # OmniParser 包装
│   └── embed.py       # SigLIP2/CLIP 包装
└── utils/             # 工具函数
    └── image.py       # 图像处理
```

### 6.1 复用模式示例

```python
# vision_sidecar/vision_sidecar/processors/vlm.py
from vision_agents.plugins.moondream import MoondreamProcessor
from vision_agents.core.processors import VideoProcessor

class VLMWrapper:
    """包装 Moondream 为 RPC 可调用的服务"""
    
    def __init__(self):
        self.moondream = MoondreamProcessor()
    
    async def caption(self, image_path: str) -> dict:
        """生成图像描述"""
        result = await self.moondream.caption(image_path)
        return {
            "text": result.text,
            "confidence": result.confidence,
            "latency_ms": result.latency_ms
        }
```

---

## 7. 不兼容点与解决方案

| Vision-Agents 设计 | 本项目需求 | 解决方案 |
|-------------------|-----------|---------|
| WebRTC/实时流为主 | 离线图像处理为主 | 适配 `VideoProcessor` 接受文件路径输入 |
| GetStream Edge 依赖 | 无 Edge 网络 | 移除 Edge 相关初始化，仅保留处理器 |
| 多参与者会话 | 单用户 CLI | 简化 Agent 初始化 |
| 强调 TTS/STT | 先只做视觉 | 延迟到 Sprint 4 再集成 |

---

## 8. 结论

**高价值复用**:
1. `Processor` 基类 —— 统一处理器接口
2. `MoondreamProcessor` —— Tier 1 VLM
3. `UltralyticsProcessor` —— 目标检测
4. `GeminiRealtime` —— Sprint 4 Live 模式

**低价值复用**（建议自建）:
- Claude API 调用（TS 端已完善）
- 通用 LLM 抽象（过于复杂，当前不需要）
- WebRTC 相关（本项目无需实时音视频传输）

**下一步**: 基于本清单，在 S0-6 创建 `vision_sidecar/` 骨架， Sprint 1 开始逐步集成上述组件。
