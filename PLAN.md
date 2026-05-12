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
   - **Demo C — GUI Pair Programming**（stretch）：屏幕共享 + Gemini Live 实时讲解。
5. **Mini Benchmark**：自建 20 例 visual-coding + Design2Code 子集 10 例 + VisualWebArena 子集 10 例。
6. **课程报告 + 5 分钟 demo 视频**。

---

## 3. 模块设计（7 模块）

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

### 模块 5：视觉验证闭环（Visual Test Loop）

**目标**：作为日常 dev 副驾，**每次代码改动后自动跑视觉回归**。

- 新 slash command：`/visual-debug`。
- 触发器：文件保存或 `git diff` 非空（chokidar watcher）。
- 步骤：起 dev server → `BrowserVisionTool` 截当前路由 → 与"上次成功"截图 diff → 异常区域 crop 后送 `VisionQATool` 问"这里看起来对吗？预期是 X"。
- 与 `FileEditTool` 联动：LLM 判异常时自动产出补丁建议。

### 模块 6：视觉 Memory + 多模态 RAG

**目标**：让 agent 记住"上次见过的截图/UI 状态"，支持"上次那个红色按钮在哪？"。

- 嵌入器：SigLIP2 或 CLIP-Large（sidecar）。
- 文档级视觉检索：ColPali / ColQwen2（PDF/截图 patch embedding + late-interaction）。
- 存储：`~/.claude/vision_memory.lancedb`（LanceDB 本地，零运维）。
- 新 Tool：`VisionMemorySearchTool`，与原 `memdir/` 持久记忆体系打通。

### 模块 7：实时多模态 Live 模式（**stretch，可砍**）

- 新 slash command：`/live`。
- 输入：屏幕共享流 + 麦克风。
- 处理：屏幕流 → VideoForwarder（直接复用 Vision-Agents）→ YOLO/OmniParser → 关键帧降采样 → Gemini Live / OpenAI Realtime。
- 输出：TTS 实时讲解 + 屏幕 set-of-mark overlay。
- **明确为 stretch**：不阻塞主线交付，时间不够直接砍。

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

### 6.5 Sprint 3（Week 3）— GUI Agent + 视觉验证闭环

| Ticket | 内容 | Acceptance |
|--------|------|------------|
| S3-1 | `/visual-debug` command + chokidar watcher | 文件保存触发自动截图 + diff |
| S3-2 | GUI Agent 远程派：Anthropic Computer Use API 集成 | OSWorld 10 例子集跑通 |
| S3-3 | GUI Agent sandbox：docker + Xvfb 脚本 | 隔离运行 |
| S3-4 | GUI Agent 本地派：UI-TARS-1.5 sidecar（**stretch**，时间不够就砍） | 同样 OSWorld 10 例 |
| S3-5 | Sprint demo：`/gui "打开 calculator 算 23×17"` + `/visual-debug` 演示 | 录 1min mp4 |

**人介入点**：周日看 demo。如果 S3-4 没做完不阻塞。

### 6.6 Sprint 4（Week 4）— 视觉 Memory + Eval + 收尾

| Ticket | 内容 | Acceptance |
|--------|------|------------|
| S4-1 | SigLIP2 + LanceDB 嵌入存储 | 索引 ≥ 100 张图能 <100ms 检索 |
| S4-2 | `VisionMemorySearchTool` + 自动入库 hook | tool 跑通 |
| S4-3 | 自建 mini-eval 20 例（含 5 例真实 GitHub issue 截图） | `eval/visual_coding/` |
| S4-4 | 跑 Design2Code 子集 10 例 + VisualWebArena 子集 10 例 | `eval/results/*.jsonl` |
| S4-5 | Routing ablation：关 router / 全走 Tier 1 / 全走 Tier 3 三个对照 | `eval/ablation_router.md` |
| S4-6 | 报告 `REPORT.md` 初稿（架构图、消融、案例） | ≥ 8 页 |
| S4-7 | 录 5 分钟 demo 视频（脚本 + 录屏 + 字幕） | mp4 |

**人介入点**：周末整理报告署名/课程模板适配（预计 1–2h）。

### 6.7 缓冲（Week 5，可选）

- 修 bug、补单测覆盖率 ≥ 60%、模块 7 Live 模式（如果还有精力）。
- 否则用于让 AI 重写报告 / 改 PPT。

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

## 8. 评测方案

| 类别 | 数据集 | 规模 | 指标 |
|------|--------|------|------|
| Screenshot→Code | Design2Code 子集 | 10 | CLIP-similarity / 颜色 MAE / 人工 1–5 分 |
| Visual Web Task | VisualWebArena 子集 | 10 | task success rate |
| GUI Operation | OSWorld 子集（macOS apps） | 10 | step-level + task-level success |
| 自建 Visual-Coding | 自构 20 例（含 5 个真实 GitHub issue 截图） | 20 | success + 平均轮数 + 平均成本 |
| **Routing 消融** | 全 Tier1 / 全 Tier3 / 路由 | — | 任务成功率 vs 成本散点 |
| **模块消融** | 关 ImageDiff / 关 reflection / 关 router | — | 同上 |

所有评测脚本进 `eval/`，结果固化到 `eval/results/*.jsonl`。

---

## 9. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| TS↔Python sidecar 协议踩坑（编码、信号、僵尸进程） | 高 | 中 | S0-3/S0-6 就把协议固化，先写 echo 测试，参考 LSP 实现 |
| MiniCPM-V / UI-TARS / OmniParser 模型体积大、下载慢 | 中 | 中 | `scripts/download_models.sh` 后台下；默认 Moondream 兜底 |
| Anthropic Computer Use API 费用 | 中 | 中 | Router 预算控制；本地派作为 fallback |
| Playwright headless 在 macOS arm64 不稳 | 中 | 低 | Playwright 1.45+ 原生支持；CI 走 ubuntu runner |
| GUI 操作真实点击造成误操作 | 高 | 高 | 默认 dry-run；`--yolo` 才执行；docker+xvfb sandbox |
| 模块 7 (Live) realtime API 调通耗时 | 高 | 低 | 标 stretch，直接砍也不影响主线 |
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

## 12. 立即可以开干（极简）

只需要做一件事：**`/agent` 让 Cursor agent 开干 Sprint 0**。Sprint 0 的所有 ticket 都不需要人介入，跑完后你周日来看输出即可。

提示词模板：
> "按 `PLAN.md` §6.2 跑 Sprint 0 的 S0-1 到 S0-6，每个 ticket 完成后在该 ticket 旁打勾，最后产出一个 sprint-0 总结。"
