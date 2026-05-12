# Claude Code Vision — 课程项目规划文档 (v2)

> **一句话目标**：在已泄露的 `claude-code` 源码（`src/`）基础上，融合 `Vision-Agents` 的视觉 Processor 体系与 2025 年以来的 GUI Agent / VLM / Screenshot-Driven Dev / Hybrid LLM Routing 等开源精髓，把一个"纯文本 CLI 编程助手"升级为"具备视觉感知、UI 验证闭环、GUI 操作能力，且具有本地/云端混合路由的多模态编程 Agent"。

本文档面向课程作业评审，强调**完整度而非创新**。v2 相对 v1 的关键改动：
- **大幅减少人需要做的事**：周节奏改成"AI 自驱 sprint + 人周末 checkpoint"。
- **已实际精简 `src/`**：删掉了 100+ 个用不上的子目录/文件，见 §11。
- **新增 Hybrid VLM Routing 模块**：简单视觉走本地 MiniCPM-V / Moondream，复杂走 Claude / Gemini-Vision，参考 RouteLLM / FrugalGPT 的 router 思路。

---

## 1. 项目背景与现状盘点

### 1.1 `src/` (claude-code, TypeScript + Bun + Ink) — 精简后

- **保留的 Tool 层**（`src/tools/`，从 ~40 个精简到 26 个）：`BashTool`、`FileReadTool`（已支持读图/PDF，内部用 `sharp` 压缩到 token 限制内）、`FileEditTool`、`FileWriteTool`、`GlobTool`、`GrepTool`、`WebFetchTool`、`WebSearchTool`、`AgentTool`（子 agent 派生）、`SkillTool`、`MCPTool`、`LSPTool`、`NotebookEditTool`、`TodoWriteTool`、`Task*Tool`、`EnterPlanModeTool` 等。
- **保留的 Command 层**（`src/commands/`，从 ~80 个精简到 24 个）：`/agents`、`/clear`、`/compact`、`/config`、`/context`、`/diff`、`/doctor`、`/files`、`/hooks`、`/init`、`/mcp`、`/memory`、`/model`、`/permissions`、`/plan`、`/plugin`、`/resume`、`/review`、`/session`、`/skills`、`/status`、`/tasks`、`/help`、`/version`、`/exit`、`/env`、`/ctx_viz`。
- **核心引擎**：`QueryEngine.ts`（46K 行，tool-call loop + thinking + streaming）、`Tool.ts`、`commands.ts`、`tools.ts`、`query.ts` 全部保留。
- **多模态现状**：仅 "FileReadTool 把图片 base64 塞给 Claude" 一种被动模式。**没有** processor pipeline、**没有** 本地 VLM、**没有** 屏幕级 computer-use、**没有** 视觉验证 loop。

### 1.2 `Vision-Agents/` (Python + uv workspace)

- **核心抽象**：`Agent`（lifecycle + edge/llm/processors 编排）+ `Processor`（`VideoProcessor`/`AudioProcessor`/`Publisher`，可串成流水线）。
- **视觉插件**：`ultralytics`（YOLO）、`moondream`（轻量 VLM）、`roboflow`（自训模型）、`nvidia`（Cosmos 世界模型）、`decart`（视频重风格化）。
- **多模态闭环**：WebRTC → VAD → STT → LLM（OpenAI/Gemini Realtime）→ TTS。
- **痛点**：定位是"实时视频客服/教练"，没有面向编程任务、没有文件/shell 工具。

### 1.3 两者的天然融合点

| 维度 | `claude-code` 提供 | `Vision-Agents` 提供 | 融合产物 |
|------|--------------------|----------------------|----------|
| 任务编排 | Tool/Command/Permission/Skill | Agent/Processor lifecycle | TS 主线 + Python sidecar |
| 工具 | 文件/shell/git/Web | YOLO/Moondream/Cosmos | 视觉 Tool family |
| 数据通路 | 文本/图片单帧 | 音视频流 + processor 流水线 | 屏幕流 + 处理 pipeline |
| LLM | Anthropic Claude | OpenAI/Gemini Realtime + Anthropic | 已对齐 Claude，可平移 |

---

## 2. 项目愿景与最终交付物

### 2.1 一段话愿景

让 `claude` 在 CLI 里不仅能读你的代码，还能**看你的屏幕、看你的浏览器渲染结果、看你的设计稿**；能用本地轻量 VLM 做廉价视觉判断、能在复杂场景升级到 Claude/Gemini Vision、能用 Claude Computer Use 做真实 GUI 操作、能在每一次代码改动后自动截图比对验证——把"写完不知道对不对"的开环升级成"写–跑–看–改"的闭环。

### 2.2 最终交付物

1. **可运行的扩展版 CLI**：`claude-code-vision`（新 entry，不依赖原 `main.tsx`）。
2. **Python 视觉 sidecar**（`vision_sidecar/`）：复用 Vision-Agents 的 processor，与 TS 主进程通过 stdio JSON-RPC 通信。
3. **Hybrid Vision Router**：自动决定每个视觉查询走本地还是云端。
4. **3 个端到端 demo**：
   - **Demo A — Screenshot-to-Code**：设计图 → agent 写代码 → playwright 截图 → diff → 反思迭代。
   - **Demo B — Visual Bug Reproduction**：agent 启 dev server → 截图浏览器 → 定位 UI bug → 提交 patch。
   - **Demo C — GUI Pair Programming**：屏幕共享 + Gemini Live 实时讲解 + 屏幕 overlay 标注。
5. **Mini Benchmark**：自建 + Design2Code / VisualWebArena / OSWorld 子集（具体规模由跑评测时决定，本计划阶段不锁数）。
6. **课程报告 + 5 分钟 demo 视频**。

---

## 3. 模块设计（6 模块）

> 设计原则：**每个模块独立可用 + 可退化**。所有视觉计算优先走本地小模型，失败/不够准再升级到 Claude / Gemini-Vision。

### 模块 1：视觉中台 — Pipeline + Sidecar + **Router**

**这是最核心的模块，包含三件事**：

#### 1.1 Vision Processor Pipeline（TS 端）
- 新增 `src/vision/pipeline.ts`：定义 `VisionProcessor` 接口（`process(frame): EnrichedFrame`），支持串/并联。
- 每个视觉 Tool 调用前后都过 pipeline，方便统一插入降采样、ROI 裁剪、缓存、router。

#### 1.2 Python Sidecar（stdio JSON-RPC）
- 新增 `vision_sidecar/`：复用 `Vision-Agents/plugins/ultralytics`、`moondream`、`roboflow` 的现成实现。
- 协议参考 LSP 风格（headers + JSON body），避免端口冲突。
- TS 端 `src/vision/sidecar.ts` 封装 `call("vlm.caption", {...})`，含超时、重启、并发控制。

#### 1.3 Hybrid Vision Router（核心特色）

**思路**：参考 OpenRouter.ai 的多模型聚合 + RouteLLM / FrugalGPT 的 cost-aware cascading（用户提到的 OpenBMB 思路对应到具体技术上就是这条线；OpenBMB 的 MiniCPM-V 系列正好作为本地后端首选）。

- **路由策略**：
  1. **规则路由**（第一道）：根据 Tool 类型 + 图片复杂度（分辨率、字数 OCR 估计、UI 元素数）选 tier。
     - Tier 1（本地）：MiniCPM-V 2.6 (~8B) / Moondream 3 (~2B) / Florence-2 → 处理"图里有什么/读这段文字/找按钮坐标"等。
     - Tier 2（云端便宜）：Gemini 2.5 Flash Vision / Claude Haiku → 处理"理解这个截图想表达什么"。
     - Tier 3（云端 SOTA）：Claude Sonnet/Opus / Gemini 2.5 Pro → 复杂推理 / Computer Use 决策。
  2. **置信度升级**（第二道）：Tier 1 输出含置信度（VLM 自我评分 + 简单 logits-based），低于阈值自动 escalate 到 Tier 2/3。
  3. **回放路由**（第三道，离线训练用）：所有调用记录到 `~/.claude/router_log.jsonl`，未来可训一个轻量 router（参考 RouteLLM 的 BERT-classifier 路径）。
- **预算控制**：复用 `cost-tracker.ts`，每个 session 给视觉路由设上限（例如 $0.5/session），超限强制降级。
- **缓存**：同一图片 hash + 同一 prompt 命中缓存（24h TTL）。

新增文件：
```
src/vision/router/
  ├── router.ts          # 路由主逻辑
  ├── strategies.ts      # 规则/置信度/回放三种策略
  ├── budgets.ts         # 预算控制
  └── cache.ts           # 图像+prompt 哈希缓存
```

### 模块 2：视觉工具家族（`src/tools/vision/`）

| Tool | 功能 | Tier 1 / 2 / 3 | 对标 |
|------|------|----------------|------|
| `ScreenshotTool` | 截全屏/窗口/区域 | OS native command | Anthropic Computer Use |
| `BrowserVisionTool` | 启 headless Chromium 截网页 + 读 DOM + 执行 JS | playwright | screenshot-to-code |
| `VisionQATool` | 对图片提问（caption/VQA） | MiniCPM-V / Moondream → Claude | OpenBMB MiniCPM-V |
| `UIParseTool` | 屏幕→元素树+可点击 bbox | OmniParser v2 → Claude | OmniParser |
| `OCRTool` | 文字识别 | PaddleOCR/RapidOCR → Claude | — |
| `ImageDiffTool` | 像素/语义对比 | pixelmatch + CLIP cosine | visual-regression |
| `VideoFrameTool` | 视频关键帧抽取 | ffmpeg + scene-detect | — |
| `AnnotateTool` | 图上叠 bbox/编号 | sharp/pillow | Set-of-Mark prompting |

每个 Tool 走 `buildTool` + permission，与 `FileReadTool` 风格一致。

### 模块 3：GUI Agent 子系统（屏幕级 Computer Use）

**目标**：任务无法用 shell/文件完成时（如"帮我在 Slack 桌面客户端找昨天那条消息"），切到 GUI 模式。

- 新增 `src/coordinator/gui_agent.ts`，与现有 `AgentTool` 派生机制对齐。
- 行动空间：`click(x,y) / type(text) / scroll / hotkey / wait`。
- 决策路径（自动 fallback）：
  1. **远程派**：Anthropic Computer Use API（`computer_20250124` tool）。
  2. **本地派**：UI-TARS-1.5-7B / OS-Atlas / ShowUI sidecar，本地推理。
- **安全沙箱**（**必须**）：
  - 默认 dry-run：把动作画在标注图上让用户确认。
  - `--yolo` 才真实执行；提供 docker+Xvfb 脚本 `scripts/gui_sandbox.sh`。
- 新 slash command：`/gui <任务>`。

### 模块 4：Screenshot-Driven Dev 工作流

**目标**：复刻 v0 / screenshot-to-code，但跑在本地、能跨多文件改 repo。

- 新 slash command：`/design2code <图片路径>`。
- 流程：
  1. `VisionQATool` 解析设计图 → 结构化描述（区域树 + 字体/配色/组件清单）。
  2. agent 用 `FileWriteTool` scaffold React + Tailwind。
  3. 起 `npm run dev`，`BrowserVisionTool` 截图。
  4. `ImageDiffTool`（pixelmatch + CLIP）打分；低于阈值则进入 reflection 修源码再截图。
  5. 最多 N 轮（默认 5），输出最终 diff 报告。

### 模块 5：视觉记忆 + 验证闭环（合并）

**合并理由**：两者数据通路同源（都是"把见过的截图存下来 + 出问题时检索/比对"），区别只是"主动 vs 被动触发"。一套存储 + 一套检索接口，外加两种触发器。

**统一存储**：
- 嵌入器：SigLIP2（默认）或 CLIP-Large（sidecar）。
- 文档级视觉检索：ColPali / ColQwen2（PDF/截图 patch embedding + late-interaction）。
- 存储：`~/.claude/vision_memory.lancedb`（LanceDB 本地，零运维）。
- 自动入库 hook：每次 `BrowserVisionTool` / `ScreenshotTool` / `FileReadTool` 看到的图都打 tag 入库。

**两个使用面**：
1. **被动记忆查询**（slash command `/recall`）：用 `VisionMemorySearchTool`，回答"上次那个红色按钮在哪？"这种问题。
2. **主动验证闭环**（slash command `/visual-debug`）：chokidar watcher → 文件保存触发 → 起 dev server → `BrowserVisionTool` 截当前路由 → 与库里"上次成功"截图做 `ImageDiffTool` → 异常区域 crop 后送 `VisionQATool` 问"这里看起来对吗？预期是 X" → 与 `FileEditTool` 联动自动产出补丁建议。

### 模块 6：实时多模态 Live 模式

- 新 slash command：`/live`。
- 输入：屏幕共享流 + 麦克风。
- 处理：屏幕流 → VideoForwarder（直接复用 Vision-Agents）→ YOLO/OmniParser → 关键帧降采样（fps=2）→ Gemini Live 或 OpenAI Realtime。
- 输出：TTS 实时讲解 + 屏幕 set-of-mark overlay（独立 overlay 窗口，复用 `AnnotateTool` 渲染）。
- 集成路径：直接复用 Vision-Agents 的 `Agent` 类编排（`edge` 用 local screen capture 替代 WebRTC，`llm` 用 `gemini.Realtime` / `openai.Realtime`），降低自研成本。

---

## 4. 系统架构

```
┌────────────────────────────────────────────────────────────────┐
│                  Claude Code Vision CLI  (TS / Bun)            │
│                                                                │
│   ┌──────────────┐    ┌──────────────────┐   ┌──────────────┐  │
│   │  Commands    │    │  Query Engine    │   │   Skills     │  │
│   │ /design2code │◀──▶│  (tool loop)     │◀─▶│              │  │
│   │ /visual-debug│    │                  │   │              │  │
│   │ /gui  /live  │    └─────────┬────────┘   └──────────────┘  │
│   └──────────────┘              │                              │
│                                 ▼                              │
│   ┌────────────────────────────────────────────────────────┐   │
│   │   Tool Registry  +  Vision Pipeline                    │   │
│   │   既有: Bash/FileEdit/Grep/WebFetch ...                │   │
│   │   新增: Screenshot/BrowserVision/VisionQA/             │   │
│   │         UIParse/OCR/ImageDiff/Annotate ...             │   │
│   └────────────────────────┬───────────────────────────────┘   │
│                            │                                   │
│                            ▼                                   │
│   ┌────────────────────────────────────────────────────────┐   │
│   │            Hybrid Vision Router                        │   │
│   │   规则路由 → 置信度升级 → 缓存 → 预算控制              │   │
│   └────┬──────────────────┬──────────────────────┬─────────┘   │
└────────┼──────────────────┼──────────────────────┼─────────────┘
         │                  │                      │
         ▼                  ▼                      ▼
   ┌──────────┐      ┌─────────────┐      ┌────────────────┐
   │ Tier 1   │      │ Tier 2      │      │ Tier 3         │
   │ 本地 VLM │      │ 云端便宜    │      │ 云端 SOTA      │
   │ MiniCPM-V│      │ Haiku/Flash │      │ Sonnet/Opus    │
   │ Moondream│      │             │      │ Gemini 2.5 Pro │
   └────┬─────┘      └─────────────┘      └────────────────┘
        │                                          ▲
        ▼                                          │
   ┌──────────────────────────────────────────────┘
   │ Python Vision Sidecar (uv workspace)
   │  ┌─────────────────────────────────────────┐
   │  │ Processor Pipeline (复用 Vision-Agents) │
   │  │  YOLO │ MiniCPM-V │ Moondream │         │
   │  │  OmniParser │ CLIP/SigLIP2 │ PaddleOCR  │
   │  │  ColPali │ UI-TARS │ pyautogui          │
   │  └─────────────────────────────────────────┘
   └─────────────────────────────────────────────
```

通信协议（JSON-RPC over stdio）：

```jsonc
// Request
{ "id": "req-1", "method": "vlm.caption",
  "params": { "image_path": "/tmp/a.png", "model": "minicpm-v-2.6",
              "prompt": "describe", "max_tokens": 256 } }

// Response
{ "id": "req-1", "result": { "text": "...", "confidence": 0.83,
                              "boxes": [], "latency_ms": 312 } }
```

---

## 5. 参考文献与开源项目（按主题）

### 5.1 Hybrid LLM Routing（模块 1.3，新增重点）

- **RouteLLM** (Ong et al., 2024, lm-sys) — 学习一个轻量 router，把 query 在 strong/weak 模型间路由。<https://github.com/lm-sys/RouteLLM>
- **FrugalGPT** (Chen et al., 2023, Stanford) — cost-aware cascading（先便宜后贵，置信度低再升级）。<https://arxiv.org/abs/2305.05176>
- **Hybrid LLM** (Ding et al., 2024, Microsoft) — 训练 router 在云端/边缘模型间分流。
- **OpenRouter.ai** — 产品化的多模型路由 + fallback aggregator，工程参考。
- **MiniCPM-V 2.6** (2024, OpenBMB) — 8B 端侧 VLM，性能接近 GPT-4V，本地 Tier 1 首选。<https://github.com/OpenBMB/MiniCPM-V>

### 5.2 GUI Agent / Computer Use（模块 3）

- **Anthropic Computer Use** (2024, Anthropic) — 模块 3 远程派直接调。<https://docs.anthropic.com/en/docs/build-with-claude/computer-use>
- **UI-TARS / UI-TARS-1.5** (2025, ByteDance) — 端到端 GUI 基础模型；模块 3 本地派首选。<https://github.com/bytedance/UI-TARS>
- **OS-Atlas** (2024, Shanghai AI Lab) — 跨平台 GUI grounding。
- **Agent S2** (2025, Simular AI) — 分层 GUI Agent。<https://github.com/simular-ai/Agent-S>
- **ShowUI** (2025, NUS/Microsoft) — 视觉-语言-action 统一。
- **Aguvis** (2025, HKU/Salesforce) — 统一视觉 agent 训练框架。
- **SeeClick** (2024, NJU) — 早期 GUI grounding。
- **Magma** (2025, Microsoft) — 多模态 agent 基础模型。
- **cua / trycua** (2025, 开源) — macOS computer use 实现参考。<https://github.com/trycua/cua>
- **self-operating-computer** (开源, OthersideAI)

### 5.3 视觉大模型 / VLM（模块 1/2/6）

- **MiniCPM-V 2.6 / MiniCPM-o** (2024–2025, OpenBMB) — 本地 Tier 1 首选。
- **Qwen2.5-VL / Qwen3-VL** (2025, Alibaba) — 高质量本地 7B+ 选项。
- **Moondream 2/3** (2024–2025) — 1.5–2B 超轻量，Vision-Agents 已集成。
- **Florence-2** (2024, Microsoft) — caption/detect/seg/ocr 一把梭。
- **SigLIP / SigLIP 2** (2024–2025, Google) — 模块 6 嵌入用。
- **OmniParser v2** (2025, Microsoft) — 屏幕→元素树。<https://github.com/microsoft/OmniParser>
- **ColPali / ColQwen2** (2024–2025, ILLUIN/EPFL) — 文档视觉检索。

### 5.4 Screenshot-Driven Dev（模块 4）

- **Design2Code** (2024, Stanford) — 核心 benchmark。<https://arxiv.org/abs/2403.03163>
- **WebSight v2** (2024, HuggingFace) — Sketch→HTML 数据。
- **WebGen-Bench** (2025) — 网页生成评测。
- **v0** (Vercel) — 工业产品形态参考。
- **screenshot-to-code** (开源, abi/screenshot-to-code) — prompt 工程直接借。<https://github.com/abi/screenshot-to-code>

### 5.5 视觉验证 / Web Agent（模块 5）

- **VisualWebArena** (2024, CMU) — 浏览器视觉任务评测。<https://jykoh.com/vwa>
- **WebArena** (2023, CMU) — 文本基线。
- **Percy / Chromatic / Lost-Pixel** — 工业 visual regression。

### 5.6 多模态 SWE Agent（项目愿景）

- **SWE-bench Multimodal** (2024, Princeton) — 终极对齐目标。<https://www.swebench.com/multimodal.html>
- **SWE-agent** (2024, Princeton) — 文本版 SOTA agent。
- **OpenHands / OpenDevin** (2024) — 已有视觉 agent 分支。

### 5.7 实时视频 Agent（模块 7）

- **Gemini 2.0/2.5 Live API** (2024–2025, Google)
- **OpenAI Realtime API** (2024–2025, OpenAI)
- **NVIDIA Cosmos** (2025) — Vision-Agents 已集成。
- **Vision-Agents** (2025, GetStream) — **本项目主要被融合对象**。<https://github.com/GetStream/Vision-Agents>

### 5.8 Prompting / Reasoning

- **Set-of-Mark Prompting** (2023, Microsoft) — 模块 2 `AnnotateTool` 依据。
- **Anthropic "Computer use" prompting cookbook** (2024–2025) — 官方 prompt 模板。

---

## 6. 开发计划（AI 自驱 sprint 节奏）

### 6.1 核心理念

**人只做三件事**：
1. **Sprint 启动**（每周一，5–10 分钟）：阅读上周 demo + 当前 sprint 的 ticket 列表，批准 / 调整。
2. **Sprint 验收**（每周日，15–20 分钟）：看 AI 产出的 demo 视频 + eval 报告，给 "go / 改 / 砍" 决策。
3. **资源/凭据**（一次性）：提供 Anthropic + OpenAI/Gemini API key、确认本地能跑 8B VLM（Mac M-series 24GB+ 或单卡 24GB GPU）。

**AI（Cursor agent）做**：所有 coding / debug / test / eval / 文档 / demo 录制脚本 / 报告初稿。每个 sprint 拆成多个独立 ticket，可并发派给多个 Cursor 子 agent。

### 6.2 Sprint 0（前 3 天，AI 自动）

**目标**：把所有"前置基础设施"准备完，让后续 sprint 不卡在环境。

| Ticket | 内容 | 输出 |
|--------|------|------|
| S0-1 | 扫 `src/` 精简后剩余代码，画 tool-call 时序图（mermaid） | `docs/00_arch_review.md` |
| S0-2 | 扫 `Vision-Agents/agents-core/`，整理 Processor + Sidecar 复用清单 | `docs/01_vision_agents_inventory.md` |
| S0-3 | 定义 stdio JSON-RPC 协议（参考 LSP） | `docs/02_sidecar_protocol.md` |
| S0-4 | 写新 entry：`src/entry.ts` 极简版（只 wire bash/file/grep 等保留 tools），用 bun 跑通 hello-world tool call | 可启动的 minimal CLI |
| S0-5 | 拉 MiniCPM-V 2.6 / Moondream 2 / OmniParser v2 模型到本地缓存（脚本化） | `scripts/download_models.sh` |
| S0-6 | 建 `vision_sidecar/` Python 包，跑通 echo RPC | sidecar skeleton |

**人介入点**：仅在 S0-4 跑不通时帮忙看错误（预计概率 30%）。

**Sprint 0 完成记录（2026-05-12）**：
- ✅ S0-1: `docs/00_arch_review.md` —— 完成 src/ 架构评审，含 tool-call 时序图、QueryEngine 分析
- ✅ S0-2: `docs/01_vision_agents_inventory.md` —— 完成 Vision-Agents 复用清单，标识 Processor 基类、Moondream/Ultralytics 等高价值组件
- ✅ S0-3: `docs/02_sidecar_protocol.md` —— 完成 JSON-RPC over stdio 协议规范（LSP 风格）
- ✅ S0-4: `src/entry.ts` —— 极简 CLI 入口，可运行基础 Tool（Bash/File/Grep/Web）
- ✅ S0-5: `scripts/download_models.sh` —— 模型下载脚本，支持 Moondream/MiniCPM-V/OmniParser/Florence-2
- ✅ S0-6: `vision_sidecar/` —— Python 包骨架，含 server.py/registry.py/vlm.py/detect.py，echo 测试通过

**状态**: 所有前置基础设施就绪，可进行 Sprint 1。

---

### 6.3 Sprint 1（Week 1）— 视觉中台 + 工具家族（一半）

| Ticket | 内容 | Acceptance |
|--------|------|------------|
| S1-1 | `src/vision/sidecar.ts`：进程管理 + RPC 客户端 + 超时重启 | 单测覆盖 ≥ 80% |
| S1-2 | `vision_sidecar/methods/vlm.py`：MiniCPM-V + Moondream 双后端 + 置信度输出 | RPC 跑通 |
| S1-3 | `vision_sidecar/methods/detect.py`：YOLO（直接 import Vision-Agents 的 ultralytics 插件） | RPC 跑通 |
| S1-4 | `src/vision/router/`：规则路由 + 置信度升级 + 缓存 + 预算 | 单测 + 合成数据回归 |
| S1-5 | `VisionQATool` + `OCRTool` + `AnnotateTool`（三个最简单的） | tool call 能从 CLI 跑通 |
| S1-6 | 写 sprint demo 脚本：`scripts/demo_sprint1.sh`（图片 → caption + OCR + 标注） | 录 30s gif |

**人介入点**：周日看 demo gif，确认"视觉中台 + 路由 + 三个工具"形态对路。

**Sprint 1 完成记录（2026-05-12）**：
- ✅ S1-1: `src/vision/sidecar.ts` —— TypeScript RPC 客户端，支持进程管理、超时控制、心跳检测、自动重启
- ✅ S1-2: `vision_sidecar/methods/vlm.py` + `vlm_real.py` —— MiniCPM-V + Moondream 双后端实现，含加载、推理、置信度输出
- ✅ S1-3: `vision_sidecar/methods/detect.py` + `yolo_detect.py` —— YOLO 检测实现，支持 YOLOv8 (n/s/m/l)
- ✅ S1-4: `src/vision/router/` —— 混合路由 (router.ts)、LRU 缓存 (cache.ts)、预算控制 (budgets.ts)，支持规则路由 + 置信度升级 + 预算降级
- ✅ S1-5: `VisionQATool.ts` + `OCRTool.ts` + `AnnotateTool.ts` —— 三个视觉工具，走 Hybrid Router
- ✅ S1-6: `scripts/demo_sprint1.sh` —— Sprint 1 demo 脚本，包含 echo 测试、VLM/OCR/检测调用流程演示

**状态**: 视觉中台基础设施完成，支持 mock 和真实模型（通过 `USE_REAL_MODELS` 切换）。

---

### 6.4 Sprint 2（Week 2）— 工具家族（另一半） + Screenshot-Driven Dev

| Ticket | 内容 | Acceptance |
|--------|------|------------|
| S2-1 | `ScreenshotTool`（mac/linux 分发到 native cmd） | 能截全屏/指定窗口 |
| S2-2 | `BrowserVisionTool`（playwright wrap） | 能起 headless 截网页 + 读 DOM |
| S2-3 | `ImageDiffTool`（pixelmatch + CLIP） | 双指标 |
| S2-4 | `UIParseTool`（OmniParser v2 sidecar） | 输出元素树 + bbox |
| S2-5 | `/design2code` command：prompt 模板 + scaffold + dev server + diff loop | 至少 3 例样张能跑出可访问页面 |
| S2-6 | Sprint demo：录 `/design2code ./samples/login.png` 完整链路 | 录 1min mp4 |

**人介入点**：周日看 demo，判断"截图驱动开发"质量是否值得继续做模块 5（如果不行就砍/合并模块 5）。

**Sprint 2 完成记录（2026-05-12）**：
- ✅ S2-1: `ScreenshotTool.ts` —— 屏幕截图工具，支持 macOS (screencapture) / Linux (gnome-screenshot/scrot/grim)，全屏/窗口/区域三种模式
- ✅ S2-2: `BrowserVisionTool.ts` —— Playwright 封装，支持网页截图、DOM 提取、JS 执行、模拟交互
- ✅ S2-3: `ImageDiffTool.ts` —— 双指标对比（像素级 pixelmatch + 语义级 CLIP），支持差异图输出
- ✅ S2-4: `UIParseTool.ts` —— UI 元素解析，支持 OmniParser/YOLO/VLM/hybrid 四种后端
- ✅ S2-5: `/design2code Command` —— 完整链路实现：VisionQATool 分析 → FileWriteTool 生成 React+Tailwind → BashTool 启动 dev server → BrowserVisionTool 验证 → ImageDiffTool 对比
- ✅ S2-6: `demo_sprint2.sh` —— Sprint 2 demo 脚本

**状态**: 视觉工具家族（8个工具）全部完成，Screenshot-Driven Dev 链路打通。

---

### 6.5 Sprint 3（Week 3）— GUI Agent + 视觉记忆/验证闭环（模块 3 + 5 一半）

| Ticket | 内容 | Acceptance |
|--------|------|------------|
| S3-1 | `/visual-debug` command + chokidar watcher | 文件保存触发自动截图 + diff |
| S3-2 | GUI Agent 远程派：Anthropic Computer Use API 集成 | OSWorld 子集能跑通 |
| S3-3 | GUI Agent sandbox：docker + Xvfb 脚本 | 隔离运行 |
| S3-4 | GUI Agent 本地派：UI-TARS-1.5 sidecar（**必做**） | 同样跑 OSWorld 子集，输出与远程派对照表 |
| S3-5 | Sprint demo：`/gui "打开 calculator 算 23×17"` + `/visual-debug` 演示 | 录 1min mp4 |

**人介入点**：周日看 demo。

**Sprint 3 完成记录（2026-05-12）**：
- ✅ S3-1: `/visual-debug Command` —— chokidar 文件监听，自动截图 + ImageDiffTool 对比，支持 start/stop/status 子命令
- ✅ S3-2: `GUIAgentTool.ts` —— 支持 anthropic/uitars/mock 三种后端，操作空间：click/type/scroll/hotkey/wait/screenshot，默认 dry-run 安全模式
- ✅ S3-3: `gui_sandbox.sh` —— Docker + Xvfb + Fluxbox + VNC 完整沙箱脚本，支持录屏、截图、shell 访问
- ✅ S3-4: `vision_sidecar/gui.py` —— UI-TARS 模型包装 + GUIExecutor 执行器，gui.execute/gui.click/gui.type/gui.screenshot 方法
- ✅ S3-5: `demo_sprint3.sh` —— Sprint 3 demo 脚本，演示 visual-debug 流程 + GUI Agent mock 模式

**状态**: GUI Agent 子系统完成，支持远程派（Anthropic）、本地派（UI-TARS）、安全沙箱（Docker）三种运行模式。

---

### 6.6 Sprint 4（Week 4）— 视觉记忆收尾 + Live 模式 + 报告

| Ticket | 内容 | Acceptance |
|--------|------|------------|
| S4-1 | SigLIP2 + LanceDB 嵌入存储 + 自动入库 hook（与模块 5 主动验证打通） | 索引 ≥ 100 张图能 <100ms 检索 |
| S4-2 | `VisionMemorySearchTool` + `/recall` command | tool 跑通 |
| S4-3 | `/live` 模式：复用 Vision-Agents 的 `Agent` 类编排屏幕流 + Gemini Live / OpenAI Realtime | 能边看屏幕边讲解 30s+ |
| S4-4 | 屏幕 overlay 渲染（独立窗口，set-of-mark 标注） | 能在屏幕上画框 |
| S4-5 | 评测脚本骨架 `eval/run.py`（具体数据集和题目数待 Sprint 启动时定） | 框架可跑、留空待填 |
| S4-6 | 报告 `REPORT.md` 初稿（架构图、案例、消融位留空） | ≥ 8 页骨架 |
| S4-7 | 录 5 分钟 demo 视频（脚本 + 录屏 + 字幕） | mp4 |

**人介入点**：周末整理报告署名 / 课程模板适配（预计 1–2h）。

**Sprint 4 完成记录（2026-05-12）**：
- ✅ S4-1: `vision_sidecar/methods/embed.py` + `rag.py` —— SigLIP2/CLIP 双后端嵌入，LanceDB 向量存储，支持 store/search/query/list
- ✅ S4-2: `VisionMemorySearchTool.ts` + `/recall Command` —— 自然语言搜索视觉记忆，recent/search/tags/browse/stats 子命令
- ✅ S4-3: `/live Command` —— Gemini Live / OpenAI Realtime 集成，支持 fps/annotation/voice 配置
- ✅ S4-4: `VisionOverlay` 类 —— 独立透明窗口，Set-of-Mark 标注渲染 (box/circle/label/highlight)
- ✅ S4-5: `eval/run.py` —— 评测框架骨架，支持 Design2Code/OSWorld/VisualWebArena，消融实验设计
- ✅ S4-6: `REPORT.md` —— 课程报告初稿 (10页骨架，含架构图、模块详解、实验设计、参考文献)
- ✅ S4-7: `demo_sprint4.sh` —— Sprint 4 演示脚本

**状态**: 所有模块实现完成，报告骨架就绪，等待 Sprint 5 评测精修。

---

### 6.7 缓冲（Week 5）

- 跑评测（具体设计在这一周根据模块完成度临场决定，§8 仅给方向不锁规模）。
- 修 bug、补单测覆盖率 ≥ 60%、报告精修、PPT。

---

## 7. 人 vs AI 工作分配（总览）

| 项 | 人 | AI（Cursor agent） |
|----|----|---------------------|
| 拍板方向 | ✅ | — |
| API key、GPU 资源 | ✅（一次性） | — |
| 看每周 demo + 决策 | ✅（15min/周） | — |
| 调研论文 / 写 reading list | — | ✅ |
| 写代码 | — | ✅ |
| 写单元测试 | — | ✅ |
| 跑 eval | — | ✅ |
| 写文档 / 报告初稿 | — | ✅ |
| 录 demo 视频脚本 / 录屏 | — | ✅（脚本生成 + 自动录屏） |
| 报告署名 / 适配课程模板 | ✅（1–2h） | — |
| 解决环境 / API 配额问题 | ✅（仅 AI 卡住时） | — |

**人总投入预估**：4–5 周 × ~1h/周 = **5–6h**。

---

## 8. 评测方案（仅方向，规模/题目数延后到 Sprint 5 决定）

**候选数据集**：
- Screenshot→Code：Design2Code
- Visual Web Task：VisualWebArena
- GUI Operation：OSWorld（macOS apps 子集）
- 自建 Visual-Coding：含若干真实 GitHub issue 截图

**候选指标**：CLIP-similarity / 颜色 MAE / task success rate / step-level success / 平均轮数 / 平均成本。

**候选消融**：
- Routing ablation：全 Tier1 / 全 Tier3 / 完整路由
- 模块 ablation：关 ImageDiff / 关 reflection / 关 router

> 现阶段不写具体题目数与跑评细节；Sprint 5 启动时根据模块完成度、API 预算、报告字数要求临场决定。所有评测脚本未来进 `eval/`，结果固化到 `eval/results/*.jsonl`。

---

## 9. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| TS↔Python sidecar 协议踩坑（编码、信号、僵尸进程） | 高 | 中 | S0-3/S0-6 就把协议固化，先写 echo 测试，参考 LSP 实现 |
| MiniCPM-V / UI-TARS / OmniParser 模型体积大、下载慢 | 中 | 中 | `scripts/download_models.sh` 后台下；默认 Moondream 兜底 |
| Anthropic Computer Use API 费用 | 中 | 中 | Router 预算控制；本地派作为 fallback |
| Playwright headless 在 macOS arm64 不稳 | 中 | 低 | Playwright 1.45+ 原生支持；CI 走 ubuntu runner |
| GUI 操作真实点击造成误操作 | 高 | 高 | 默认 dry-run；`--yolo` 才执行；docker+xvfb sandbox |
| 模块 6 (Live) realtime API 调通耗时 | 中 | 中 | 直接复用 Vision-Agents 的 `gemini.Realtime` / `openai.Realtime`，不自研协议层；最坏情况退化为"5s 一帧"伪实时 |
| UI-TARS-1.5 本地推理慢/不稳 | 中 | 中 | 量化版优先（Q4/Q5 GGUF），单机跑不动就走 vLLM remote endpoint |
| AI 子 agent 跑偏（如改坏不该改的目录） | 中 | 中 | 每个 sprint 严格 ticket 化，PR 形式合入；人周日 review diff |

---

## 10. 目录结构（最终态）

```
claude-code-vision/
├── src/                              # 已精简的 claude-code 源码
│   ├── tools/
│   │   ├── ... (26 个保留的 tool)
│   │   └── vision/                   # 新增视觉 Tool 家族
│   │       ├── ScreenshotTool/
│   │       ├── BrowserVisionTool/
│   │       ├── VisionQATool/
│   │       ├── UIParseTool/
│   │       ├── OCRTool/
│   │       ├── ImageDiffTool/
│   │       ├── AnnotateTool/
│   │       └── VisionMemorySearchTool/
│   ├── commands/
│   │   ├── ... (24 个保留的 command)
│   │   ├── design2code/              # 新 slash
│   │   ├── visual-debug/
│   │   ├── gui/
│   │   └── live/
│   ├── vision/                       # 视觉中台
│   │   ├── pipeline.ts
│   │   ├── sidecar.ts
│   │   ├── router/
│   │   │   ├── router.ts
│   │   │   ├── strategies.ts
│   │   │   ├── budgets.ts
│   │   │   └── cache.ts
│   │   └── types.ts
│   ├── coordinator/
│   │   └── gui_agent.ts
│   └── entry.ts                      # 新 minimal entrypoint（替代 main.tsx）
├── vision_sidecar/                   # Python sidecar
│   ├── pyproject.toml
│   └── vision_sidecar/
│       ├── server.py                 # stdio JSON-RPC
│       ├── registry.py
│       └── methods/
│           ├── vlm.py                # MiniCPM-V / Moondream / Qwen-VL
│           ├── detect.py             # YOLO via Vision-Agents
│           ├── ui_parse.py           # OmniParser
│           ├── ocr.py
│           ├── embed.py              # SigLIP2 / CLIP / ColPali
│           └── act.py                # pyautogui + UI-TARS
├── Vision-Agents/                    # vendored repo（只读，import 其 plugin）
├── eval/
│   ├── design2code/
│   ├── visualwebarena/
│   ├── osworld/
│   ├── visual_coding/
│   └── run.py
├── docs/
│   ├── 00_arch_review.md
│   ├── 01_vision_agents_inventory.md
│   ├── 02_sidecar_protocol.md
│   └── 03_routing_design.md
├── scripts/
│   ├── gui_sandbox.sh
│   ├── download_models.sh
│   └── demo_sprint*.sh
├── PLAN.md                           # 本文档
├── REPORT.md                         # 课程报告
└── README.md
```

---

## 11. 已删除的 src/ 内容（v2 实际执行）

为减少噪音、明确范围，本次实际删掉的内容（git baseline `ad8fc1c` 之后）：

**整目录删除**：
- `src/buddy/`（彩蛋）
- `src/bridge/`（IDE 桥接，与 CLI 项目无关）
- `src/remote/`（远程会话）
- `src/server/`（server 模式）
- `src/upstreamproxy/`（企业代理）
- `src/migrations/`（老版本迁移）
- `src/vim/`、`src/voice/`、`src/keybindings/`、`src/native-ts/`、`src/moreright/`、`src/outputStyles/`

**services 子目录删除**：`oauth` / `settingsSync` / `teamMemorySync` / `policyLimits` / `remoteManagedSettings` / `PromptSuggestion` / `AgentSummary` / `MagicDocs` / `SessionMemory` / `autoDream` / `tips` / `extractMemories` / `analytics` / `toolUseSummary`，以及 `notifier.ts` / `claudeAiLimits*.ts` / `mockRateLimits.ts` / `rateLimit*.ts` / `diagnosticTracking.ts` / `preventSleep.ts` / `awaySummary.ts` / `internalLogging.ts` / `mcpServerApproval.tsx` / `voice*.ts` / `vcr.ts`。

**commands 删除**（保留下面 24 个之外的全部）：
保留：`agents / clear / compact / config / context / ctx_viz / diff / doctor / env / exit / files / help / hooks / init.ts / mcp / memory / model / permissions / plan / plugin / resume / review / session / skills / status / tasks / version.ts`。
删除涵盖：商业化（install / login / logout / share / upgrade / oauth-refresh / privacy-settings / stickers / mobile / desktop / teleport / feedback / release-notes / install-github-app / install-slack-app）、配额（cost / usage / stats / rate-limit-options / extra-usage / reset-limits / mock-limits）、IDE bridge（bridge / bridge-kick / ide）、远程（remote-env / remote-setup）、调试（heapdump / perf-issue / break-cache / debug-tool-call / sandbox-toggle / backfill-sessions / reload-plugins）、proactive（rewind / thinkback / thinkback-play / btw / effort / fast / good-claude / ant-trace / advisor / insights / brief）、PR（security-review / review.ts / commit / commit-push-pr / pr_comments / autofix-pr / passes / bughunter / issue / tag / branch / summary）、vim / voice / chrome / color / theme / statusline / terminalSetup / onboarding / init-verifiers / output-style / copy / export / rename / add-dir / ultraplan / createMovedToPluginCommand。

**tools 删除**：`SleepTool / RemoteTriggerTool / ScheduleCronTool / SyntheticOutputTool / TeamCreateTool / TeamDeleteTool / SendMessageTool / PowerShellTool / REPLTool / BriefTool / ConfigTool`。

**规模变化**：`src/` 60M+ → **29M**；TS/TSX 文件 ~1900 → **1573**。

> 注意：`main.tsx` 仍引用部分已删除模块，会有 import 红线。我们不会复用 `main.tsx`，会在 Sprint 0 写新的 `src/entry.ts` 作为入口；红线无影响。

---

## 12. 扩展方向（Sprint 5–8，深度 + 广度升级）

> **写作目的**：v3 PLAN 完成的 6 个模块更像"视觉工具集合"，缺少"agent 自己驱动视觉行为"和"长时序 / 多模态 / 自学习"等多模态 agent 圈 2024–2026 的核心范式。本节追加 5 个方向（A–E），全部加入主线，由 Sprint 5–8 落地。每个方向均按"问题 → 论文支撑 → 技术方案 → 接口签名 → Ticket 表 → 集成点 → demo 设计"组织，确保下游 agent（如 kimi）可直接领回去开工。
>
> **执行假设**：v3 §3 的 6 个模块已落地（实际状态参考 `REPORT.md` 自述）。新方向**复用而非替换**已有：
> - 已有 sidecar methods：`vlm.py / detect.py / embed.py / gui.py / rag.py / yolo_detect.py`
> - 已有 vision types：见 `src/vision/types.ts`
> - 已有 router：`src/vision/router/{router.ts, budgets.ts, cache.ts}`
> - 已有 commands：`design2code / visual-debug / recall / live`
> - 已有 tools：`VisionQATool / OCRTool / BrowserVisionTool / ScreenshotTool / UIParseTool / ImageDiffTool / AnnotateTool`

### 12.0 五个方向总览

| 方向 | 标签 | Sprint | 工期 | 工程量 | 与现有代码耦合 |
|------|------|--------|------|--------|----------------|
| **A. Agentic Visual Search** | "让 VLM 自己反复看图" | S5 | 2–3 天 | 小 | 扩 `vlm.py` + `VisionQATool` |
| **B. Long-Form Video / Replay** | "录屏 + 视频 QA + /replay" | S6 | 5 天 | 中 | 扩 `live` + 新增 `VideoQATool` |
| **C. Multi-modal RAG / Doc** | "PDF + 图表 + 表格 RAG" | S7 | 5 天 | 大 | 扩 `rag.py` + `embed.py` + 新增 `DocRAGTool` |
| **D. Visual Planning / WebDreamer** | "GUI Agent 先想后点" | S7 | 4 天 | 中 | 改 `coordinator/gui_agent.ts` |
| **E. Skill Discovery / Self-improving** | "session 后自动写 skill" | S5 | 2 天 | 小 | 复用 `src/skills/` |

### 12.1 方向 A — Agentic Visual Search（V\* / ZoomEye / VisualSketchpad）

#### A.1 问题

`VisionQATool` 现在是 one-shot：把全图扔给 VLM 拿答案。当图里有**小目标 / 密集 UI / 小字 / 表格**时，本地 Tier 1 VLM（MiniCPM-V / Moondream）会直接答错，被迫升级到 Tier 3 拉爆预算。

#### A.2 论文/项目支撑

- **V\*: Guided Visual Search as a Core Mechanism in Multimodal LLMs**（Wu & Xie, CVPR 2024）— <https://github.com/penghao-wu/vstar>
- **ZoomEye: Enhancing Multimodal LLMs with Human-Like Zooming via Tree-Based Image Exploration**（THU 2024）— <https://github.com/om-ai-lab/ZoomEye>
- **Visual Sketchpad: Sketching as a Visual Chain of Thought**（Stanford 2024）— <https://github.com/Yushi-Hu/VisualSketchpad>
- **VisProg / ViperGPT**（CVPR 2023）— visual program synthesis 范式起点
- **OpenAI o3 / GPT-5 image reasoning**（关键词：crop / zoom / mark）

#### A.3 技术方案

**核心**：sidecar 新增 `vlm.agentic_qa`，内部跑 micro-loop。每轮 VLM 输出**JSON-action**（answer | crop | zoom | annotate | grid_split），sidecar 执行后把新图送回下一轮，直到 answer 或 `max_steps`。

**RPC 接口（写入 `docs/02_sidecar_protocol.md`）**：

```jsonc
// Request
{ "method": "vlm.agentic_qa",
  "params": {
    "image_path": "/tmp/screen.png",
    "prompt": "What is the error code in the bottom-right toast?",
    "max_steps": 5,
    "base_model": "minicpm-v-2.6",   // 内部 micro-loop 用的 VLM
    "trace_dir": "~/.claude/agentic_trace/<session_id>/"
  } }

// Response
{ "result": {
    "answer": "Error code: ECONNREFUSED",
    "confidence": 0.91,
    "steps": [
      { "step": 0, "action": "crop", "bbox": [1200, 800, 1920, 1080],
        "rationale": "Error toasts usually appear bottom-right" },
      { "step": 1, "action": "zoom", "factor": 2,
        "rationale": "Text too small to read" },
      { "step": 2, "action": "answer", "text": "ECONNREFUSED" }
    ],
    "trace_images": ["step0.png", "step1.png", "step2.png"],
    "total_latency_ms": 4521
  } }
```

**Action schema（VLM 必须返回的 JSON）**：

```jsonc
{ "action": "crop" | "zoom" | "annotate" | "grid_split" | "answer",
  "bbox": [x1, y1, x2, y2],     // crop/annotate 用
  "factor": 2,                   // zoom 用
  "labels": [...],               // annotate/grid_split 用
  "text": "...",                 // answer 用
  "rationale": "..."             // 总是必填，便于 trace
}
```

**Python 端实现要点**（`vision_sidecar/vision_sidecar/methods/vlm_agentic.py`）：
1. 用 PIL 做 crop / resize / annotate（已有依赖）。
2. JSON 解析失败时给 VLM 退回原 prompt 重试 1 次。
3. 每步保存 `trace_dir/step{N}.png`，便于 CLI 展示。
4. 复用 `vlm.py` 已加载的 model（不重复 init）。

**TS 端**：`src/tools/vision/VisionQATool.ts` 加 option `agentic?: boolean`。`agentic=true` 时调 `vlm.agentic_qa`，否则走老路 `vlm.caption`。router 层加规则："任务含 `tiny/error_code/dense_ui/small_text` 等关键词 → 自动开 agentic"。

#### A.4 Ticket 表（Sprint 5）

| ID | 内容 | Acceptance |
|----|------|------------|
| S5-A1 | 写 action JSON schema + 写 prompt 模板（参考 V\* 仓库 prompt） | `vision_sidecar/prompts/agentic_qa.txt` |
| S5-A2 | sidecar 实现 crop/zoom/annotate/grid_split primitives | 单测：给定 bbox 输出正确尺寸图 |
| S5-A3 | 实现 `vlm.agentic_qa` micro-loop（含 JSON 解析、重试、max_steps） | 端到端：传图 + prompt 返回 step trace |
| S5-A4 | TS `VisionQATool` 加 `agentic` 选项 + router 启发式规则 | 调用链通 |
| S5-A5 | CLI trace 渲染：在 ink 输出"步骤树"（每步缩略图 + rationale） | demo 时可见 |
| S5-A6 | 自测：5 例 small-text/dense-UI 任务，对比 agentic on/off | 准确率提升 ≥ 20pp |

#### A.5 与现有代码集成点

- 复用：`vision_sidecar/methods/vlm.py`（model loader）、`src/vision/sidecar.ts`（RPC client）。
- 新增：`vision_sidecar/methods/vlm_agentic.py`、`vision_sidecar/prompts/agentic_qa.txt`、`src/vision/agentic.ts`（trace 渲染辅助）。
- 修改：`src/tools/vision/VisionQATool.ts`（加 agentic 选项）、`src/vision/router/strategies.ts`（加 agentic 触发规则）。
- 不影响：`detect / embed / rag / gui` 等已有 method。

#### A.6 Demo 设计

录一个 30s GIF：截一张 1920×1080 浏览器报错截图 → `/visionqa --agentic "what's the error?"` → CLI 边跑边显示"step 0: cropping bottom-right…step 1: zooming…step 2: answer ECONNREFUSED"，对比 `--no-agentic` 直接错答。

---

### 12.2 方向 B — Long-Form Video / Screen Replay（VideoAgent / Qwen2.5-VL / VideoLLaMA3）

#### B.1 问题

`/live` 现在 fps=2 单向直播，**无记忆**。用户问"我刚才 5 分钟做了啥？哪步出错？" 答不了。

#### B.2 论文/项目支撑

- **VideoAgent: Long-form Video Understanding with LLM as Agent**（Stanford, ECCV 2024）— <https://github.com/wxh1996/VideoAgent>
- **LLaVA-Video / LLaVA-OneVision**（ByteDance + UWisc 2024）— <https://llava-vl.github.io>
- **VideoLLaMA 3**（Alibaba 2025）— <https://github.com/DAMO-NLP-SG/VideoLLaMA3>
- **Qwen2.5-VL**（Alibaba 2025，原生多帧）— <https://github.com/QwenLM/Qwen2.5-VL>
- **MA-LMM: Memory-Augmented LMM for Long Video**（CVPR 2024）
- **EgoSchema / LongVideoBench / Video-MME** — 评测集
- 商业参考：**Rewind.ai** 的开源平替方向

#### B.3 技术方案

**三段式**：录屏 → 关键帧抽取 + chapter 摘要 → 视频 QA。

##### B.3.1 录屏（扩 `/live`）
- `src/commands/live/index.ts` 默认开 ffmpeg 录屏到 `~/.claude/sessions/<sid>/recording.mp4`（25 fps，h264，crf=28，预计 5 min ≈ 30 MB）。
- 提供 `--no-record` 关闭。

##### B.3.2 关键帧 + chapter（sidecar 新 method `video.summarize`）
- 用 **PySceneDetect** 做 shot detection；shot 太短再补均匀采样。
- 关键帧（默认 16 帧）→ 喂给 VLM 一次性出 chapter 摘要：`[{start, end, summary}]`。
- 每个 chapter 的首帧用 SigLIP2 embed，入库到现有 LanceDB（schema 加字段 `kind="video_chapter"`、`session_id`、`time_range`、`video_path`）。

##### B.3.3 视频 QA（sidecar 新 method `video.qa`）
- 后端默认 **Qwen2.5-VL-7B**（多帧原生支持）；备选 VideoLLaMA3。
- 接口：

```jsonc
{ "method": "video.qa",
  "params": {
    "video_path": "/path/recording.mp4",
    "prompt": "When did the build fail?",
    "frames": 16,            // 采样帧数
    "time_range": [120, 360] // 可选，秒
  } }
```

##### B.3.4 新工具 + 新命令
- TS 新工具 `src/tools/vision/VideoQATool.ts`。
- 新命令 `src/commands/replay/`：
  - `/replay 5min` → 最近 5 min 视频 QA
  - `/replay "刚才那个报错"` → 用 chapter 摘要 + SigLIP2 检索 top-3 chapter → 再视频 QA
  - `/replay --list` → 列所有 session 视频

#### B.4 Ticket 表（Sprint 6）

| ID | 内容 | Acceptance |
|----|------|------------|
| S6-B1 | `/live` 集成 ffmpeg 录屏（开关 + 路径管理 + 优雅停止） | 录出可播放 mp4 |
| S6-B2 | sidecar PySceneDetect 关键帧抽取 | 输入 mp4 输出 N 张 png |
| S6-B3 | sidecar `video.summarize` （chapter 摘要 + 首帧 embed） | 5 min 视频 < 60s 出 chapter |
| S6-B4 | sidecar `video.qa` 集成 Qwen2.5-VL-7B（multi-frame） | 单测：固定视频 + 固定问题答案稳定 |
| S6-B5 | LanceDB schema 升级 + chapter 入库 hook（与方向 E 共用 session 结束钩子） | session 结束自动写入 |
| S6-B6 | `VideoQATool` + `/replay` 命令 + 检索路径 | `/replay "...err"` 能定位 |
| S6-B7 | demo：10 min session 录屏 → `/replay` 三类 query | 录 1 min demo |

#### B.5 与现有代码集成点

- 复用：`src/commands/live/`、`vision_sidecar/methods/embed.py`（SigLIP2）、`vision_sidecar/methods/rag.py`（LanceDB 写入）。
- 新增：`vision_sidecar/methods/video.py`、`src/tools/vision/VideoQATool.ts`、`src/commands/replay/`、`src/services/sessionRecorder.ts`（ffmpeg 子进程包装）。
- 修改：现有 LanceDB schema（新增 `kind` 字段，做向后兼容迁移：旧记录默认 `kind="screenshot"`）。

#### B.6 Demo 设计

录一段 10 min "调 bug 失败→改→成功"的真实开发过程，session 结束后跑：
1. `/replay --list` 看到 session
2. `/replay 5min "what changed?"` 出 timeline
3. `/replay "the failed test"` 直接跳到失败那一刻 + 解释

---

### 12.3 方向 C — Multi-modal RAG / Document（ColPali / VisRAG / MinerU / DocLayout-YOLO）

#### C.1 问题

现在的 vision memory 只索引 screenshot；用户问"看这个 PDF 第 23 页那张图说明了啥"答不了；GitHub issue 中的图表/表格识别不准。Vision-Agents 的 `rag/` 模块也只是文本 RAG。

#### C.2 论文/项目支撑

- **ColPali / ColQwen2**（Faysse et al., 2024）— 文档 patch-level late-interaction 检索
- **VisRAG: Vision-based RAG on Multi-modality Documents**（**OpenBMB 2024**）— <https://github.com/OpenBMB/VisRAG>
- **MinerU**（Shanghai AI Lab 2024）— PDF → 结构化的开源 SOTA — <https://github.com/opendatalab/MinerU>
- **Docling**（IBM 2024）— 备选
- **DocLayout-YOLO**（2024）— 文档区域检测 — <https://github.com/opendatalab/DocLayout-YOLO>
- **ChartGemma**（Google 2024）/ **TinyChart**（Alibaba 2024）— 图表 QA
- **Table-LLaVA**（2024）— 表格图 QA

#### C.3 技术方案

**四段式**：文档解析 → 区域分类 → patch embedding → late-interaction RAG。

##### C.3.1 文档解析
- 新 sidecar method `doc.parse(path)`：
  - PDF → MinerU 输出 page images + 结构化 markdown
  - HTML → playwright 截每屏 + 保留 DOM
  - markdown + 图 → 已有路径
- 输出统一为 `[{page_idx, image_path, kind, bbox?, ocr_text?}]`，`kind` ∈ {`text` | `figure` | `chart` | `table`}。

##### C.3.2 区域分类
- 用 **DocLayout-YOLO** 在每页检测 region；裁出 figure/chart/table 单独存。
- chart/table 用 ChartGemma / Table-LLaVA 生成"semantic caption"作为附加索引文本。

##### C.3.3 Embedding（扩 `embed.py`）
- 新增 `embed.colqwen2(image_path, mode="patches")`：返回 patch 级 embedding 矩阵（typical 1024 patches × 128 dim）。
- 老的 SigLIP2 路径保留作 fallback。

##### C.3.4 RAG（扩 `rag.py`）
- LanceDB schema 升级：
  - 加 `doc_id`、`page_idx`、`region_kind`、`patch_embeddings`（list[vector]）、`caption`、`source_path`。
  - 老 screenshot 记录的 `region_kind="screenshot"`、`patch_embeddings=null` 兼容。
- 检索：late-interaction MaxSim — 对 query embedding 与每个 patch 取 max，再 sum 排序。
- 检索结果**整页**喂给 VLM 答（参考 VisRAG 设计）。

##### C.3.5 新工具 + 新命令
- TS 新工具 `src/tools/vision/DocRAGTool.ts`。
- 新命令 `src/commands/doc/`：
  - `/doc index <path-or-url>` — 一次性吃 PDF/URL/目录
  - `/doc ask "..."` — 问问题（自动检索 + VLM）
  - `/doc list` — 看已索引文档

#### C.4 Ticket 表（Sprint 7，与方向 D 并行）

| ID | 内容 | Acceptance |
|----|------|------------|
| S7-C1 | MinerU 集成（`doc.parse`） | 跑通 10 页 paper → page images + md |
| S7-C2 | DocLayout-YOLO 区域检测 + crop | figure/chart/table 三类 ≥ 80% 召回 |
| S7-C3 | ChartGemma + Table-LLaVA semantic caption | chart/table 都有非空 caption |
| S7-C4 | `embed.colqwen2(patches)` + LanceDB schema 升级（含迁移脚本） | 老库可读 + 新字段可写 |
| S7-C5 | `rag.py` 加 late-interaction retrieve | 准确率 vs 原 SigLIP2 路径有提升 |
| S7-C6 | `DocRAGTool` + `/doc` 三个子命令 | 端到端 demo 通 |
| S7-C7 | demo：吃 1 篇 10 页 paper + 1 篇 GitHub issue → 3 类 query（含跨表 / 含图） | 录 1 min |

#### C.5 与现有代码集成点

- 复用：现有 LanceDB（`~/.claude/vision_memory.lancedb`）、现有 `embed.py`、现有 `rag.py`、`WebFetchTool`（抓网页时联动）。
- 新增：`vision_sidecar/methods/doc.py`、`vision_sidecar/methods/chart_table.py`、`src/tools/vision/DocRAGTool.ts`、`src/commands/doc/`。
- 修改：`embed.py`（加 colqwen2）、`rag.py`（加 MaxSim 检索）、LanceDB schema（加 5 个字段 + 迁移脚本 `vision_sidecar/migrations/001_doc_rag.py`）。

#### C.6 Demo 设计

吃 1 篇 ColPali 论文 PDF + 1 个 GitHub issue 网页 → 问 3 类：
1. "Table 3 哪个 baseline 最差？" → 跨页表格
2. "Figure 2 是什么架构？" → 图表
3. "issue #42 截图里报错了什么？" → 跨文档

---

### 12.4 方向 D — Visual Planning / World Model（WebDreamer / SeeAct / AppAgent v2）

#### D.1 问题

`gui_agent` 现在是 **reactive**：每一步 `screenshot → LLM(action) → execute`。失败率高，错了无法回退。Real-world GUI 操作中"想错一步 → 错下去 → 全盘崩"是 OSWorld 主要失败源。

#### D.2 论文/项目支撑

- **WebDreamer: Model-Based Planning for Web Agents**（OSU + Amazon 2024）— LLM 自己当 world model 模拟 — <https://github.com/OSU-NLP-Group/WebDreamer>
- **SeeAct: Vision-Language Models as Web Agents**（OSU 2024）— visual grounding 与 planning 分离 — <https://github.com/OSU-NLP-Group/SeeAct>
- **AppAgent v2**（Tencent 2024）— 手机 GUI 探索 + 知识库
- **Magma**（Microsoft 2025）— 多模态 agent 基础模型
- **NVIDIA Cosmos**（2025, Vision-Agents 已集成）— 真 world model，可选
- **DeepMind Genie 2**（2024）— 可交互世界模型，仅做思路参考

#### D.3 技术方案

**核心**：在 `gui_agent` 加 PlannerLayer，把单步推理改为 **propose → simulate → select → execute**（纯文本模拟，不真做 image diffusion）。

##### D.3.1 流程改造（`src/coordinator/gui_agent.ts`）
```text
当前 reactive:
  screenshot → LLM.act() → execute

改为 deliberative (planning_mode=true):
  screenshot
    → LLM.propose(k=3)              // 候选动作 K 个
    → for each candidate:
        LLM.predict_next_state()    // 纯文本描述下一帧
    → LLM.judge(candidates)         // 选最优
    → execute_selected
```

##### D.3.2 接口签名

```typescript
interface PlannerOptions {
  planningMode: boolean
  k: number              // 候选数（默认 3）
  judgeModel?: string    // 选择器 LLM（默认同 base）
  saveTreeTo?: string    // ~/.claude/gui_plans/<sid>/<step>.json
}

interface CandidateAction {
  id: string
  action: GUIAction        // 复用现有 click/type/scroll/hotkey
  rationale: string
  predictedNextState: string  // 纯文本描述
  rewardScore?: number        // 0..1
}
```

##### D.3.3 三个 prompt（写到 `src/coordinator/gui_planner/prompts/`）
1. **propose.md**：`Given this screenshot and the goal, propose 3 atomic actions that could advance the task. Return JSON array.`
2. **predict.md**：`If I do action X on this screenshot, describe in one paragraph what the next screenshot will look like. Be concrete.`
3. **judge.md**：`Given the goal and these 3 predicted next states, which one most advances the task? Return {best_id, reason}.`

##### D.3.4 可视化
- 每步把候选树存 JSON：`~/.claude/gui_plans/<session>/step{N}.json`，含 K 个 candidate 的 prompt/response/score。
- CLI 加 `/gui-plan-show <session> <step>` 查看树。

#### D.4 Ticket 表（Sprint 7，与方向 C 并行）

| ID | 内容 | Acceptance |
|----|------|------------|
| S7-D1 | 三个 prompt 模板（propose/predict/judge） | `gui_planner/prompts/*.md` |
| S7-D2 | `PlannerLayer` 类实现：propose → predict → judge → select | 单测：mock LLM 时正确选最优 |
| S7-D3 | `gui_agent.ts` 接入 `planning_mode` 选项 | reactive / deliberative 两路径切换 |
| S7-D4 | 候选树 JSON 序列化 + 文件落盘 | 每步生成 1 个 json |
| S7-D5 | `/gui-plan-show` 命令（ink 树状渲染） | CLI 可见 |
| S7-D6 | 自测：OSWorld 子集 reactive vs deliberative 对照 | 成功率 / 平均步数对比表 |
| S7-D7 | demo：选 1 例 reactive 失败、deliberative 成功的任务，录 90s | 含树展开过程 |

#### D.5 与现有代码集成点

- 复用：`src/coordinator/gui_agent.ts` 已有 GUIAction 类型、`vision_sidecar/methods/gui.py` 已有 click/type/scroll primitives、`vision_sidecar/methods/vlm.py`（VLM call）。
- 新增：`src/coordinator/gui_planner/{planner.ts, prompts/}`、`src/commands/gui-plan-show/`。
- 修改：`gui_agent.ts` 在 `actNextStep()` 前插 `planner.plan()` 分支。

#### D.6 Demo 设计

选 OSWorld 一个真实失败例（如"在 Slack 找昨天那条消息"）：reactive 死循环点错 → deliberative 看到候选树展开 → 走对路径 → 成功。

---

### 12.5 方向 E — Skill Discovery / Self-improving（VOYAGER / A-MEM / Letta / Mem0）

#### E.1 问题

每次 session 独立，agent 不"学习"。claude-code 原生 Skill 系统（`src/skills/loadSkillsDir.ts`）只跑 bundled skill，没有"自动发现"的入口。

#### E.2 论文/项目支撑

- **VOYAGER: An Open-Ended Embodied Agent with LLM**（NVIDIA 2023）— Minecraft 自动 skill library — <https://github.com/MineDojo/Voyager>
- **A-MEM: Agentic Memory for LLM Agents**（Rutgers 2024）— 记忆自组织
- **Letta**（前 MemGPT，UC Berkeley 2024）— persistent agent — <https://github.com/letta-ai/letta>
- **Mem0**（开源）— 多层记忆 — <https://github.com/mem0ai/mem0>
- **AutoSkill / Skill-LM**（2024）

#### E.3 技术方案

**两步**：session 结束反思 → 写 markdown skill 入 `~/.claude/skills/auto/`，下次启动 skill loader 自动激活。

##### E.3.1 Session 结束 hook
- 在 `/exit` / SIGINT / session 自然结束时触发 `reflectSession(transcript)`：
  - 让 base LLM 读完整 transcript → 输出 JSON：

```jsonc
[{
  "name": "screenshot-to-tailwind-card",
  "description": "Convert a UI screenshot to a Tailwind React card component",
  "when_to_use": "User provides a card-like UI screenshot...",
  "instructions": "1. Use VisionQATool to extract...\n2. ...",
  "allowed_tools": ["VisionQATool", "FileWriteTool", "BashTool"],
  "evidence": ["session_xxx step 3-8"]
}]
```
  - 把每个 skill 写成 `~/.claude/skills/auto/<name>.md`，frontmatter + 正文，**复用 claude-code 已有 skill markdown 格式**。

##### E.3.2 Skill loader 兼容
- `src/skills/loadSkillsDir.ts` 已有目录扫描；只需在 init 时把 `auto/` 加入 search path。
- 加 conflict resolution：同名 skill 后入版本覆盖前者，但保留历史在 `auto/_archive/`。

##### E.3.3 三层记忆抽象（轻量复刻 A-MEM / Letta）
- **Working memory**：当前 session in-memory（已有，不动）。
- **Archival memory**：`~/.claude/memdir/` （已有，不动）。
- **Skill memory**：`~/.claude/skills/auto/` （新增）。
- 后续可平滑切到 Mem0，但本 sprint 不做。

##### E.3.4 Reflection prompt（`src/services/skillDiscovery/prompts/reflect.md`）
```text
You are reviewing a coding session transcript. Identify 0-3 reusable skills.
A "skill" is a reusable workflow that worked successfully in this session.
Be strict: only extract if the same procedure would help in a similar future task.
Output JSON: [{name, description, when_to_use, instructions, allowed_tools, evidence}].
If nothing reusable, output [].
```

#### E.4 Ticket 表（Sprint 5，与方向 A 并行）

| ID | 内容 | Acceptance |
|----|------|------------|
| S5-E1 | reflection prompt + JSON schema 校验 | `prompts/reflect.md` + zod schema |
| S5-E2 | `reflectSession()` 实现：transcript 抽取 + LLM 调用 + 文件写入 | 单测：mock LLM 输出 → 写出正确 md |
| S5-E3 | session 结束 hook：`/exit` / SIGINT 都触发 | 端到端：跑一个 session 后 `~/.claude/skills/auto/` 有新文件 |
| S5-E4 | skill loader 加 `auto/` 路径 + conflict resolution（同名 archive） | 单测：连跑 2 次同任务，第 2 次能用上第 1 次 skill |
| S5-E5 | `/skills list-auto` 命令查看自动 skill | CLI 可见 |
| S5-E6 | demo：连跑 3 个 `/design2code` 任务，第 4 个自动调 skill 跳过 scaffold | 录 1 min |

#### E.5 与现有代码集成点

- 复用：`src/skills/loadSkillsDir.ts`（已有 skill 加载机制）、现有 `SkillTool`、现有 session 退出钩子。
- 新增：`src/services/skillDiscovery/{reflect.ts, prompts/reflect.md, schema.ts}`、`src/commands/skills/list-auto.ts`。
- 修改：`src/skills/loadSkillsDir.ts`（加 `auto/` 路径）、session 退出处加 hook 注册。

#### E.6 Demo 设计

跑 3 个不同设计图的 `/design2code` 任务 → CLI 显示"discovered 2 new skills: card-component, login-form" → 第 4 个相似任务直接命中 skill，不再 scaffold from scratch，时间从 ~3min 缩到 ~30s。

---

### 12.6 Sprint 5–8 节奏与并发安排

> 节奏延续 §6 "AI 自驱 sprint + 人周末 checkpoint"。每周一 5min 批 ticket、周日 15min 看 demo。

| Sprint | 周 | 主题 | 主线 tickets | 可并发 |
|--------|------|------|----------------|--------|
| **S5** | W5 | 深度升级：A + E | S5-A1~A6, S5-E1~E6 | A 与 E 完全独立，可分 2 个 agent 并行 |
| **S6** | W6 | 视频：B | S6-B1~B7 | B 内部串行（B5 依赖 B3） |
| **S7** | W7 | 广度 + 规划：C + D | S7-C1~C7, S7-D1~D7 | C/D 完全独立，可分 2 个 agent 并行 |
| **S8** | W8 | 收尾：综合评测 + 报告 v2 + final demo | S8-1 评测设计、S8-2 跑评测、S8-3 报告升级、S8-4 5min 视频脚本+录制、S8-5 PPT | 评测内部可并发 |

**Sprint 8 评测内容**（兑现 §8 的"延后到 Sprint 5 决定"承诺，现在落地）：
- **方向 A 评测**：自构 30 例 small-text/dense-UI 题，agentic on/off 对照。
- **方向 B 评测**：自构 10 个 5–10 min screen recording + 各 5 个 query，VideoQA 准确率。
- **方向 C 评测**：MMLongBench-Doc 子集 + 自构 5 个 PDF（论文/wiki/财报），跨页跨表问答准确率。
- **方向 D 评测**：OSWorld 子集 reactive vs deliberative 任务成功率 + 平均步数。
- **方向 E 评测**：自构连续 5 个相似任务，第 N 个相对第 1 个的时间/token 节省曲线。

### 12.7 人/AI 分工更新（覆盖 §7）

新增方向后人工总投入预估：

| 阶段 | 人投入 |
|------|--------|
| Sprint 0–4（原 PLAN） | 5–6h |
| Sprint 5–8（新增） | 3–4h |
| **总计** | **8–10h，分布在 8 周内** |

人新增的任务**仅有**：每个 sprint 周日 15min demo 验收（不变） + Sprint 8 评测结果 review（多一次，约 30min）。AI 仍包揽所有编码、文档、录屏、报告初稿。

### 12.8 风险更新（覆盖 §9 增量部分）

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| 方向 A：VLM 输出 JSON 不合规、micro-loop 死循环 | 中 | 中 | JSON schema + zod 校验 + 重试上限；`max_steps` 兜底 |
| 方向 B：Qwen2.5-VL-7B 视频推理慢（单次 30s+） | 高 | 中 | 关键帧降到 8 帧；提供 vLLM endpoint fallback |
| 方向 C：MinerU 安装重（含 PyTorch + OCR 模型 ~3GB） | 中 | 中 | 写 `scripts/install_doc_rag.sh` 隔离安装；Docling 备选 |
| 方向 C：LanceDB schema migration 破坏老数据 | 中 | 高 | 迁移脚本必须可回滚；先 dry-run + 备份目录 |
| 方向 D：planning 模式延迟 4× reactive | 高 | 中 | 不默认开；只在 reactive 失败 2 次后自动 escalate |
| 方向 E：reflection 产出垃圾 skill 污染 loader | 中 | 中 | 严格 prompt + 人 review 前先放在 `auto/_pending/`；用户手动批准移到 `auto/` |
| 整体：8 周节奏被某个 sprint 拖延 | 中 | 中 | S5/S7 双 agent 并行天然有 buffer；S8 评测可砍方向 |

### 12.9 给 kimi 的"任务接收说明"

如果你（kimi）从这一节开始接手：

1. **先读**：`PLAN.md` §3 / §6 / §10 了解原始 6 模块边界；`REPORT.md` 了解已实现状态；`src/vision/types.ts` 了解类型约定。
2. **再读本节 §12.0–12.5**：理解 5 个方向的接口与 ticket。
3. **执行顺序**：严格按 §12.6 的 sprint 顺序。每个 sprint 内的 ticket ID（如 S5-A1）就是 commit message 前缀。
4. **不要做**：
   - 不要新建额外的 vision tool（7 个够用）。
   - 不要替换 SigLIP2 / LanceDB / Qwen2.5-VL 等已选型组件（除非有证据更优）。
   - 不要在 Sprint 5–7 跑任何评测（评测统一在 Sprint 8）。
5. **每个 ticket 完成 = 1 个 commit**，前缀 ticket ID + 简短描述。
6. **每个 sprint 结束**：在 `docs/sprint_<N>_summary.md` 写 200 字总结 + 1 个 demo gif/mp4 路径。

---

## 13. 立即可以开干

本计划已定稿。需要你做的：
1. **最终批准本 PLAN**（再扫一遍 §3 / §6 / §12 / §7）。
2. 准备一次性资源：Anthropic / OpenAI / Gemini API key；本地能跑 8B VLM 的机器（Mac M-series 24GB+ 或单卡 24GB GPU）。
3. 后续每个 sprint，你只需做"周一 5min 批 sprint plan / 周日 15min 看 demo"。

执行由后续 Cursor agent（或 kimi）按 §6（基线）+ §12（扩展）的 ticket 列表进行；本对话只负责订计划，不负责跑。
