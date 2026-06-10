# Sprint 6 方向 B — Long-Form Video / Screen Replay 总结

**日期**: 2026-05-12  
**分支**: main  
**提交**: S6-B1 ~ S6-B7

## 目标

实现屏幕录制回放功能，解决 `/live` 模式"无记忆"的问题：
- 录制屏幕到 mp4
- 关键帧抽取 + Chapter 摘要
- 视频 QA 检索
- `/replay` 命令回看

## 实现内容

### S6-B1: 屏幕录制服务

- 创建 `src/services/sessionRecorder.ts`:
  - `SessionRecorder` 类管理 ffmpeg 录屏
  - 支持 macOS (avfoundation)、Linux (x11grab)、Windows (gdigrab)
  - 配置: 25fps, H.264, CRF 28, veryfast 预设
  - 输出到 `~/.claude/sessions/<session_id>_<timestamp>.mp4`

- 更新 `src/commands/live/command.ts`:
  - 添加 `--no-record` 选项
  - 默认开启录屏
  - `/live stop` 自动保存录制
  - `/live status` 显示录制信息

### S6-B2: 关键帧抽取

- 创建 `vision_sidecar/methods/video.py`:
  - `extract_keyframes()`: 三种方法
    - `scenedetect`: PySceneDetect 镜头检测（如可用）
    - `uniform`: 均匀采样（ffmpeg）
    - `mock`: 测试模式
  - 使用 ffmpeg 提取单帧: `ffmpeg -ss <time> -i <video> -frames:v 1`
  - 使用 ffprobe 获取视频时长

### S6-B3: Chapter 摘要

- `video.summarize()`:
  - 抽取 max_frames 个关键帧（默认 16）
  - 每帧送 VLM 生成描述（mock 或真实）
  - 合并为 chapters: `[{start, end, summary, frame_path}]`
  - 延迟: ~13ms (mock) / 预计 <60s (真实 VLM)

### S6-B4: 视频 QA

- `video.qa()`:
  - 参数: `video_path`, `prompt`, `frames`, `time_range`
  - 多帧 VLM 推理（Mock: 启发式回答 / 真实: Qwen2.5-VL-7B）
  - 支持时间范围限定
  - 返回: `answer`, `confidence`, `relevant_frames`

### S6-B5: Chapter 入库与检索

- 更新 `vision_sidecar/methods/rag.py`:
  - `store_video_chapter()`: 将 chapter 存入 LanceDB
    - 标签: `["video_chapter", "session:<id>", "chapter:<idx>"]`
    - 额外字段: `kind`, `video_path`, `start_time`, `end_time`
  - `search_video_chapters()`: 向量检索 chapters
    - 按 session_id 过滤
    - 支持自然语言查询

- 注册到 `register_all.py`:
  - `rag.store_video_chapter`
  - `rag.search_video_chapters`

### S6-B6: VideoQATool + /replay 命令

- 创建 `src/tools/vision/VideoQATool.ts`:
  - 参数: `video_path`, `question`, `frames`, `start/end_time`, `use_chapters`
  - 支持 chapter 检索优化（默认开启）
  - 自动提取 session_id 进行搜索

- 创建 `src/commands/replay/command.ts`:
  - `/replay --list`: 列出所有 sessions
  - `/replay 5min`: 回放最近 5 分钟关键帧
  - `/replay "<query>"`: 搜索并回答

### S6-B7: Demo 脚本

- 创建 `scripts/demo_sprint6.sh`:
  - 测试视频模块所有功能
  - 生成测试帧和 mock 视频
  - 验证 chapter 存储和检索

## Demo 结果

```
测试 2: video.summarize
  总 Chapters: 5
  延迟: 13ms
  [0s - 60s] Coding activity at minute 0...
  [60s - 120s] Browser window showing documentation...

测试 3: video.qa
  "What happened?" -> 78% 置信度, 18ms
  "When did error occur?" -> 78% 置信度, 10ms
  "How many activities?" -> 78% 置信度, 14ms

测试 5: rag.store/search
  ✓ Chapter 存储成功
  ✓ 找到 1 个相关 chapters
```

## 文件变更

```
新增:
- src/services/sessionRecorder.ts
- vision_sidecar/methods/video.py
- src/tools/vision/VideoQATool.ts
- src/commands/replay/command.ts
- scripts/demo_sprint6.sh
- docs/sprint_6_video_summary.md

修改:
- src/commands/live/command.ts (+录制集成)
- vision_sidecar/methods/rag.py (+video chapter)
- vision_sidecar/methods/register_all.py (+video, +rag methods)
```

## CLI 用法

```bash
# 开始录制（默认开启录屏）
./coderetina /live

# 禁用录制
./coderetina /live --no-record

# 停止录制并保存
./coderetina /live stop

# 列出录制记录
./coderetina /replay --list

# 回放最近 5 分钟
./coderetina /replay 5min

# 搜索视频内容
./coderetina /replay "刚才的错误是什么"
./coderetina /replay "what did I do"
```

## 架构流程

```
/live start
  ↓
SessionRecorder.startRecording() → ffmpeg 录屏 → ~/.claude/sessions/*.mp4
  ↓
/live stop
  ↓
SessionRecorder.stopRecording()
  ↓
/replay "query"
  ↓
VideoQATool
  ├─ rag.search_video_chapters(query) → 找相关 chapters
  └─ video.qa(video_path, query, time_range) → 多帧 VLM 回答
  ↓
返回: 答案 + 时间点
```

## 与方向 A (Agentic) 的对比

| 特性 | 方向 A: Agentic Visual Search | 方向 B: Video Replay |
|------|------------------------------|---------------------|
| 输入 | 单张图像 | 视频（时间序列） |
| 核心 | 主动探索（crop/zoom） | 关键帧 + Chapter 摘要 |
| 问题 | 小目标/密集UI识别 | "我刚才做了什么" |
| 存储 | Trace 图像 | mp4 + LanceDB chapters |
| 延迟 | 多轮迭代（秒级） | 预计算后 <100ms |

## 参考论文

- VideoAgent: Long-form Video Understanding with LLM as Agent (ECCV 2024)
- LLaVA-Video / LLaVA-OneVision (2024)
- VideoLLaMA 3 (Alibaba 2025)
- Qwen2.5-VL (Alibaba 2025)

## 下一步（可选）

1. **真实 VLM**: 接入 Qwen2.5-VL-7B 多帧模型
2. **实时摘要**: Live 模式边录边生成 chapter
3. **与方向 C 结合**: 支持文档视频（教程、演示）的 RAG
