# CodeRetina — 项目规划（完成版）

> **目标**：在 `claude-code` 源码基础上，融合 `Vision-Agents` 视觉体系与 2024–2026 GUI Agent / VLM / Screenshot-Driven Dev 等开源精髓，将纯文本 CLI 升级为具备视觉感知、UI 验证闭环、GUI 操作能力的多模态编程 Agent。

---

## 1. 项目背景

### 1.1 现状
- **claude-code** (`src/`)：TypeScript + Bun + Ink，保留 26 个核心工具（Bash/File/Edit/Grep/Web 等），引擎 `QueryEngine.ts`（46K 行）。多模态现状：仅 FileReadTool 被动读图，无处理器流水线、无本地 VLM。
- **Vision-Agents** (`vision_sidecar/`)：Python + uv，提供 Agent/Processor 生命周期、YOLO/Moondream/Cosmos 插件。痛点：无编程任务支持。

### 1.2 融合点
| 维度 | claude-code 提供 | Vision-Agents 提供 | 融合产物 |
|------|------------------|---------------------|----------|
| 任务编排 | Tool/Command | Agent/Processor | TS 主线 + Python sidecar |
| 工具 | 文件/shell/git | YOLO/Moondream | 视觉 Tool family |
| 数据通路 | 文本/图片单帧 | 音视频流 | 屏幕流 + pipeline |
| LLM | Anthropic Claude | OpenAI/Gemini Realtime | 混合路由 |

---

## 2. 最终交付物

1. **可运行的扩展版 CLI**：`coderetina`，新 entry `src/entry.ts`（不依赖原 `main.tsx`）
2. **Python 视觉 sidecar**（`vision_sidecar/`）：stdio JSON-RPC 通信
3. **Hybrid Vision Router**：本地/云端 VLM 自动路由
4. **8 个核心 Demo**：
   - Screenshot-to-Code（设计图→代码→截图 diff→迭代）
   - Visual Bug Reproduction（截图定位 UI bug）
   - GUI Pair Programming（实时屏幕共享 + Gemini Live）
   - Agentic Visual Search（VLM 自驱动 zoom/crop/answer）
   - Long-Form Video Replay（录屏→关键帧→问答）
   - Multi-modal RAG（PDF+图表+表格检索）
   - Visual Planning（GUI Agent deliberative 模式）
   - Skill Discovery（session 自动提取可复用技能）
5. **Mini Benchmark**：Design2Code / VisualWebArena / OSWorld 子集
6. **课程报告 + 5 分钟 demo 视频**

---

## 3. 核心模块（6+5 完成）

### 基础 6 模块

| 模块 | 功能 | 状态 |
|------|------|------|
| **视觉中台** | Pipeline + Sidecar + Hybrid Router（规则/置信度/预算/缓存） | ✅ |
| **视觉工具家族** | Screenshot/BrowserVision/VisionQA/UIParse/OCR/ImageDiff/Annotate/VideoFrame | ✅ |
| **GUI Agent** | `click/type/scroll/hotkey/wait`，远程(Anthropic API)/本地(UI-TARS)双后端，dry-run 沙箱 | ✅ |
| **Screenshot-Driven Dev** | `/design2code`：设计图→React+Tailwind→dev server→diff→迭代 | ✅ |
| **视觉记忆+验证** | SigLIP2/ColPali 嵌入 + LanceDB 存储，`/recall` 记忆查询 + `/visual-debug` 自动验证 | ✅ |
| **实时 Live 模式** | `/live` 屏幕共享 + Gemini Live/OpenAI Realtime，fps=2 关键帧 + TTS | ✅ |

### 扩展 5 方向（Sprint 5-8）

| 方向 | 功能 | 状态 |
|------|------|------|
| **A. Agentic Visual Search** | VLM 自驱动 crop/zoom/annotate 多轮搜索（V*/ZoomEye 思路） | ✅ |
| **B. Long-Form Video Replay** | ffmpeg 录屏→PySceneDetect 关键帧→chapter 摘要→`/replay` 问答 | ✅ |
| **C. Multi-modal Doc RAG** | MinerU 解析→DocLayout-YOLO 区域→ColQwen2 patch embedding→MaxSim 检索 | ✅ |
| **D. Visual Planning** | GUI Agent deliberative 模式：propose→predict→judge→execute（WebDreamer 思路） | ✅ |
| **E. Skill Discovery** | session 结束 reflection→自动提取技能→`~/.claude/skills/auto/`→下次加载复用 | ✅ |

---

## 4. 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│              CodeRetina CLI  (TS / Bun)             │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────────┐    │
│  │ Commands │◀──▶│ Query Engine │◀─▶│   Vision Tools   │    │
│  │/design2c │   │ (tool loop)  │   │Screenshot/VisionQ│    │
│  │ode /gui  │   └──────┬───────┘   │A/UIParse/OCR...│    │
│  └──────────┘          │           └────────┬─────────┘    │
│                        │                    │               │
│                        ▼                    ▼               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │         Hybrid Vision Router                         │    │
│  │   规则路由 → 置信度升级 → 缓存 → 预算控制         │    │
│  └──────┬─────────────┬──────────────┬─────────────────┘    │
└─────────┼─────────────┼──────────────┼──────────────────────┘
          │             │              │
    ┌─────▼─────┐ ┌────▼────┐ ┌───────▼───────┐
    │ Tier 1    │ │ Tier 2  │ │ Tier 3        │
    │本地 VLM   │ │云端便宜 │ │云端 SOTA      │
    │MiniCPM-V │ │Haiku    │ │Sonnet/Opus    │
    │Moondream  │ │Flash    │ │Gemini Pro     │
    └─────┬─────┘ └─────────┘ └───────────────┘
          │                              ▲
          ▼                              │
    ┌────────────────────────────────────┘
    │ Python Vision Sidecar (uv)
    │  ┌─────────────────────────────┐
    │  │ YOLO │ MiniCPM-V │ Moondream│
    │  │ OmniParser │ CLIP │ UI-TARS │
    │  │ ColPali │ Video │ DocRAG   │
    │  └─────────────────────────────┘
    └────────────────────────────────────
```

通信协议：JSON-RPC over stdio

---

## 5. 实现文件结构

```
coderetina/
├── src/
│   ├── tools/vision/              # 8 个视觉工具
│   │   ├── ScreenshotTool.ts
│   │   ├── BrowserVisionTool.ts
│   │   ├── VisionQATool.ts       # + Agentic 模式
│   │   ├── UIParseTool.ts
│   │   ├── OCRTool.ts
│   │   ├── ImageDiffTool.ts
│   │   ├── AnnotateTool.ts
│   │   └── VideoQATool.ts
│   ├── commands/                  # 新增命令
│   │   ├── design2code/
│   │   ├── visual-debug/
│   │   ├── gui/
│   │   ├── live/                 # + sessionRecorder
│   │   ├── replay/               # 视频回放
│   │   ├── doc/                  # 多模态 RAG
│   │   ├── gui-plan-show/        # 规划可视化
│   │   └── skills-auto/          # 自动技能管理
│   ├── vision/
│   │   ├── pipeline.ts
│   │   ├── sidecar.ts
│   │   ├── router/
│   │   │   ├── router.ts
│   │   │   ├── strategies.ts
│   │   │   ├── budgets.ts
│   │   │   └── cache.ts
│   │   └── agentic.ts            # Agentic trace 渲染
│   ├── services/skillDiscovery/ # 方向 E
│   │   ├── reflect.ts
│   │   ├── sessionHook.ts
│   │   └── prompts/reflect.md
│   ├── coordinator/gui_agent.ts  # + PlannerLayer
│   └── entry.ts
├── vision_sidecar/
│   ├── server.py
│   ├── registry.py
│   └── methods/
│       ├── vlm.py                # + agentic_qa
│       ├── detect.py
│       ├── embed.py              # + colqwen2
│       ├── rag.py                # + maxsim
│       ├── video.py              # summarize/qa
│       ├── doc.py                # MinerU 解析
│       ├── chart_table.py
│       ├── gui.py                # + planning_mode
│       └── gui_planner/
├── scripts/
│   ├── demo_sprint*.sh           # 各 sprint demo
│   ├── download_models.sh
│   └── gui_sandbox.sh
└── docs/sprint_*_summary.md      # 各阶段总结
```

---

## 6. Sprint 完成记录

| Sprint | 主题 | 核心产出 | 状态 |
|--------|------|----------|------|
| S0 | 基础设施 | entry.ts, sidecar 骨架, 模型下载脚本 | ✅ |
| S1 | 视觉中台 | sidecar.ts, MiniCPM-V/Moondream, Router | ✅ |
| S2 | 工具家族 | 8 个视觉工具, /design2code | ✅ |
| S3 | GUI Agent | GUIAgentTool, UI-TARS, 沙箱 | ✅ |
| S4 | 记忆+Live | SigLIP2/LanceDB, /live, VideoFrame | ✅ |
| S5-A | Agentic Search | vlm.agentic_qa, crop/zoom/annotate | ✅ |
| S6-B | Video Replay | ffmpeg 录屏, PySceneDetect, /replay | ✅ |
| S7-C/D | Doc RAG + Planning | MinerU, ColQwen2, MaxSim, deliberative | ✅ |
| S8-E | Skill Discovery | reflection, auto skill, /skills-auto | ✅ |

---

## 7. 参考文献

### Hybrid Routing
- RouteLLM (lm-sys, 2024) / FrugalGPT (Stanford, 2023) / MiniCPM-V 2.6 (OpenBMB, 2024)

### GUI Agent
- Anthropic Computer Use (2024) / UI-TARS (ByteDance, 2025) / OmniParser v2 (Microsoft, 2025)

### Vision
- Qwen2.5-VL (Alibaba, 2025) / SigLIP2 (Google, 2024) / ColPali/ColQwen2 (ILLUIN/EPFL, 2024)

### Screenshot-Driven Dev
- Design2Code (Stanford, 2024) / screenshot-to-code (abi, 2024)

### Agentic / Planning
- V* (CVPR 2024) / ZoomEye (THU, 2024) / VideoAgent (ECCV 2024) / WebDreamer (OSU+Amazon, 2024)

### Skill Discovery
- VOYAGER (NVIDIA, 2023) / A-MEM (Rutgers, 2024)

---

## 8. 人/AI 分工

| 项 | 人 | AI |
|----|----|----|
| 方向决策 | ✅ | — |
| API/GPU 资源 | ✅（一次性） | — |
| 每周 demo 验收 | ✅（15min/周） | — |
| 代码/测试/文档/demo | — | ✅ |

**人总投入**：~8 周 × ~1h/周 = **~10h**

---

**状态：全部模块已完成（2026-05-12）**
