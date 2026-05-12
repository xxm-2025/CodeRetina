# Claude Code Vision — 课程项目规划文档

> 一句话目标：在已泄露的 `claude-code` 源码（`src/`）基础上，融合 `Vision-Agents` 的视觉 Processor 体系与 2025 年以来的 GUI Agent / VLM / Screenshot-Driven Dev 等开源精髓，把一个"纯文本 CLI 编程助手"升级为"具备视觉感知、UI 验证闭环和 GUI 操作能力的多模态编程 Agent"。

本文档面向课程作业评审，强调**完整度而非创新**：每一层都对齐 25–26 年的代表性工作，每一块都有可落地的实现路径与回退方案。

---

## 1. 项目背景与现状盘点

### 1.1 `src/` (claude-code, TypeScript + Bun + Ink)

- **Tool 层**（`src/tools/`，~40 个）：`BashTool`、`FileReadTool`（已支持读图/PDF，内部用 `sharp` 压缩到 token 限制内）、`GrepTool`、`WebFetchTool`、`AgentTool`（子 agent）、`SkillTool`、`MCPTool`、`LSPTool` 等。
- **Command 层**（`src/commands/`，~50 个 slash 命令）：`/commit`、`/review`、`/plan`、`/chrome`、`/voice` 等。
- **Query 引擎**（`QueryEngine.ts`，46K 行）：tool-call loop、thinking、streaming、cost 跟踪。
- **Skill 系统**（`src/skills/bundled/`）：已内置 `claude-in-chrome`，通过 `@ant/claude-for-chrome-mcp` 外挂浏览器自动化（点击、截图、读 console），**但仅限 Chrome 扩展场景**。
- **多模态现状**：仅"FileReadTool 把图片 base64 塞给 Claude"一种被动模式。**没有** processor pipeline、**没有** 本地 VLM、**没有**屏幕级 computer-use、**没有**视觉验证 loop。

### 1.2 `Vision-Agents/` (Python + uv workspace)

- **核心抽象**：`Agent`（生命周期 + edge/llm/processors 编排） + `Processor`（`VideoProcessor`/`AudioProcessor`/`Publisher`，可串成流水线）。
- **视觉插件**：`ultralytics`（YOLO 检测/分割/姿态）、`moondream`（轻量 VLM）、`roboflow`（自训模型）、`nvidia`（Cosmos 世界模型）、`decart`（视频重风格化）。
- **多模态闭环**：WebRTC（GetStream Edge）→ VAD → STT → LLM（含 OpenAI/Gemini Realtime） → TTS。
- **痛点**：定位是"实时视频客服/教练"，没有面向编程任务、没有文件系统/shell 工具。

### 1.3 自然的融合点

| 维度 | `claude-code` 提供 | `Vision-Agents` 提供 | 融合产物 |
|------|--------------------|----------------------|----------|
| 任务编排 | Tool/Command/Permission/Skill | Agent/Processor lifecycle | TS 主线 + Python sidecar |
| 工具 | 文件/shell/git/Web | YOLO/Moondream/Cosmos | 视觉 Tool family |
| 数据通路 | 文本/图片单帧 | 音视频流 + processor 流水线 | 屏幕流 + 处理 pipeline |
| LLM | Anthropic Claude | OpenAI/Gemini Realtime + Anthropic | 已对齐 Claude，可平移 |

---

## 2. 项目愿景与最终交付物

### 2.1 一段话愿景

让 `claude code` 在 CLI 里不仅能读你的代码，还能**看你的屏幕、看你的浏览器渲染结果、看你的设计稿**；能用本地 VLM 做廉价视觉判断、能用 Claude Computer Use 做真实操作、能在每一次代码改动后自动截图比对验证——把"写完不知道对不对"的开环升级成"写–跑–看–改"的闭环。

### 2.2 最终交付物

1. **可运行的扩展版 CLI**：`claude-code-vision`，安装后即支持下文 7 大模块的所有命令。
2. **Python 视觉 sidecar**（`vision_sidecar/`）：复用 Vision-Agents 的 processor，与 TS 主进程通过 stdio JSON-RPC 通信。
3. **3 个端到端 demo**：
   - Demo A: Screenshot-to-Code（给设计图，agent 生成 React 代码并自我截图对照迭代）。
   - Demo B: Visual Bug Reproduction（agent 启 `npm run dev`，按 prompt 截图浏览器并定位 UI bug）。
   - Demo C: Pair Programming Live（摄像头/麦克风+屏幕共享，Gemini Live 边看边讲）。
4. **Mini Benchmark**：自建 20 例 visual-coding 任务 + WebArena 子集 10 例 + Design2Code 子集 10 例的评测脚本与报告。
5. **课程报告 + 5 分钟 demo 视频**。

---

## 3. 模块设计（7 大模块）

> 设计原则：**每个模块独立可用 + 可退化**。所有视觉计算优先走本地小模型，失败/不够准再升级到 Claude / Gemini-Vision。

### 模块 1：视觉中台 — Vision Processor Pipeline（TS 端抽象 + Python sidecar）

**目标**：把 Vision-Agents 的 `Processor` 范式引入 claude-code，做成"任何视觉输入都先过 pipeline，再决定是否给 LLM"。

- 新增 `src/vision/`：
  - `pipeline.ts`：定义 `VisionProcessor` 接口（`process(frame): EnrichedFrame`），支持串/并联。
  - `sidecar.ts`：负责 spawn Python sidecar，封装 `call("yolo.detect", {...})` 这种 JSON-RPC 调用，支持并发与 backpressure。
- 新增 `vision_sidecar/`（Python）：
  - 复用 `Vision-Agents/plugins/ultralytics` 的 `YOLOProcessor`、`plugins/moondream` 的 VLM。
  - 暴露 stdio JSON-RPC server（参考 LSP/MCP 风格），主进程发 `{method, params}`，返回结构化结果（含 bboxes、caption、ocr 等）。
- 退化路径：sidecar 启动失败时，所有视觉工具回退为"直接把图原样喂给 Claude"。

### 模块 2：视觉工具家族（`src/tools/vision/`）

| Tool | 功能 | 实现 | 对标 |
|------|------|------|------|
| `ScreenshotTool` | 截全屏/窗口/区域 | `screencapture`(mac) / `scrot`(linux) / `nircmd`(win) | Anthropic Computer Use |
| `BrowserVisionTool` | 启 headless Chromium 截网页 / 读 DOM / 执行 JS | playwright | screenshot-to-code |
| `VisionQATool` | 对图片提问（caption/VQA） | Moondream2 / Qwen2.5-VL sidecar | Moondream |
| `UIParseTool` | 解析屏幕 UI → 元素树 + 可点击 bbox | OmniParser v2 sidecar | OmniParser |
| `OCRTool` | 文字识别 | PaddleOCR / RapidOCR sidecar | — |
| `ImageDiffTool` | 两张图像素/语义对比 | pixelmatch + CLIP cosine | visual-regression |
| `VideoFrameTool` | 抽取视频关键帧 / 切片 | ffmpeg + scene detect | — |
| `AnnotateTool` | 给图叠加 bbox/箭头/数字标号 | sharp / pillow sidecar | Set-of-Mark prompting |

每个 Tool 走 claude-code 既有的 `buildTool` + permission 机制，与现有 `FileReadTool` 风格一致；输出格式遵循 `ToolDef`，可被 LLM 引用。

### 模块 3：GUI Agent 子系统（屏幕级 Computer Use）

**目标**：当任务无法用 shell/文件完成时（如"帮我在 Slack 桌面客户端找昨天那条消息"），切换到 GUI 模式。

- 新增 `src/coordinator/gui_agent.ts`，作为现有 `coordinator/` 的子 agent。
- 行动空间：`click(x,y) / type(text) / scroll / hotkey / wait`，通过 sidecar 的 `pyautogui` 或 macOS `cliclick` 实现。
- 决策路径（两条可选 + 自动 fallback）：
  1. **远程派**：调用 Anthropic Computer Use API（`computer_20250124` tool），直接由 Claude 决策动作。
  2. **本地派**：UI-TARS-7B / OS-Atlas / ShowUI sidecar，本地推理（速度更快、离线、便宜）。
- **安全沙箱**（**必须**）：
  - 默认开启 dry-run，把动作画在屏幕标注图上让用户确认。
  - `--yolo` 模式才真实执行；提供 docker + Xvfb 隔离脚本 `scripts/gui_sandbox.sh`。
- 新 slash command：`/gui <任务>`。

### 模块 4：Screenshot-Driven Dev 工作流

**目标**：复刻 v0 / screenshot-to-code 体验，但跑在本地、能跨多文件改 repo。

- 新 slash command：`/design2code <图片路径>`。
- 流程：
  1. `VisionQATool` 给设计稿生成结构化描述（区域树 + 字体/配色/组件清单）。
  2. agent 用 `FileWriteTool` scaffold React + Tailwind（或读 `package.json` 用已有栈）。
  3. agent 起 `npm run dev`，用 `BrowserVisionTool` 截图。
  4. `ImageDiffTool`（pixelmatch + CLIP）打分；分数低于阈值则 agent 进入 reflection，修改源码后重新截图。
  5. 最多 N 轮（默认 5），输出最终 diff 报告。
- 对标：Design2Code (Stanford 2024)、WebSight、Pix2Struct、v0、screenshot-to-code。

### 模块 5：视觉验证闭环（Visual Test Loop）

**目标**：作为日常 dev 的副驾，**每次代码改动后自动跑视觉回归**。

- 新 slash command：`/visual-debug`，进入持续模式。
- 触发器：文件保存或 `git diff` 非空。
- 步骤：起 dev server → `BrowserVisionTool` 截当前路由 → 与"上次成功"截图做 `ImageDiffTool` → 异常区域 crop 后送 `VisionQATool` 问"这里看起来对吗？预期是 X"。
- 与现有 `FileEditTool` 联动：如果 LLM 判断异常，自动产出补丁建议。
- 对标：Percy、Chromatic、Lost-Pixel；论文方向：WebGen-Bench、UI-bench。

### 模块 6：视觉 Memory + 多模态 RAG

**目标**：让 agent 记住"上次见过的截图/UI 状态"，支持"上次那个红色按钮在哪？"。

- 嵌入器：SigLIP2 或 CLIP-Large（sidecar）。
- 文档级视觉检索：ColPali / ColQwen2（PDF 截图 → patch embedding → late-interaction）。
- 存储：`~/.claude/vision_memory.lancedb`（LanceDB 本地，零运维）。
- 新 Tool：`VisionMemorySearchTool`，与现有 `memdir` 体系（已有"持久 memory"模块）打通。
- 复用现有 `src/services/extractMemories/` 的钩子：会话结束时把关键截图自动入库。

### 模块 7：实时多模态模式（Live Mode）

**目标**：高阶玩法，可作为 demo C。复用 claude-code 已有的 `voice` 模块 + Vision-Agents 的 realtime LLM。

- 新 slash command：`/live`。
- 输入：屏幕共享流 + 麦克风。
- 处理：屏幕流 → VideoForwarder（来自 Vision-Agents）→ YOLO/OmniParser → 关键帧降采样（fps=2）→ Gemini Live / OpenAI Realtime API。
- 输出：TTS 实时讲解 + 在屏幕画 set-of-mark 标注（通过 overlay 窗口）。
- 工程边界：作为**可选**模块，不阻塞主线交付。

---

## 4. 系统架构

```
┌────────────────────────────────────────────────────────────────┐
│                  Claude Code Vision CLI  (TS / Bun)            │
│                                                                │
│   ┌──────────────┐    ┌──────────────────┐   ┌──────────────┐  │
│   │  Commands    │    │  Query Engine    │   │   Skills     │  │
│   │ /design2code │◀──▶│  (tool loop)     │◀─▶│ claude-in-   │  │
│   │ /visual-debug│    │                  │   │ chrome ...   │  │
│   │ /gui  /live  │    └─────────┬────────┘   └──────────────┘  │
│   └──────────────┘              │                              │
│                                 ▼                              │
│   ┌────────────────────────────────────────────────────────┐   │
│   │   Tool Registry                                        │   │
│   │   既有: Bash / FileEdit / Grep / WebFetch ...          │   │
│   │   新增: Screenshot / BrowserVision / VisionQA /        │   │
│   │         UIParse / OCR / ImageDiff / Annotate ...       │   │
│   └────────────────────────┬───────────────────────────────┘   │
│                            │ JSON-RPC over stdio              │
└────────────────────────────┼───────────────────────────────────┘
                             ▼
┌────────────────────────────────────────────────────────────────┐
│               Python Vision Sidecar (uv workspace)             │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Processor Pipeline (复用 Vision-Agents)                 │   │
│  │  YOLO  │  Moondream  │  OmniParser  │  CLIP/SigLIP2     │   │
│  │  PaddleOCR  │  ColPali  │  Qwen2.5-VL  │  UI-TARS       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                │
│  辅助: pyautogui (GUI 动作) │ playwright │ ffmpeg │ LanceDB    │
└────────────────────────────────────────────────────────────────┘
```

通信协议草案（JSON-RPC over stdio）：

```jsonc
// Request
{ "id": "req-1", "method": "vlm.caption",
  "params": { "image_path": "/tmp/a.png", "model": "moondream2", "prompt": "describe" } }

// Response
{ "id": "req-1", "result": { "text": "...", "boxes": [], "latency_ms": 312 } }
```

---

## 5. 参考文献与开源项目（按主题）

> 引用规范：每条标注 **年份 / 机构 / 用途**。课程报告里写 BibTeX 时直接拿。

### 5.1 GUI Agent / Computer Use（模块 3）

1. **Anthropic Computer Use** (2024, Anthropic) — Claude 直接操作桌面的官方 API，模块 3 远程派直接调它。<https://docs.anthropic.com/en/docs/build-with-claude/computer-use>
2. **UI-TARS / UI-TARS-1.5** (2025, ByteDance) — 端到端 GUI 基础模型，支持本地推理；模块 3 本地派的首选。<https://github.com/bytedance/UI-TARS>
3. **OS-Atlas** (2024, Shanghai AI Lab) — 跨平台 GUI grounding 模型，作为 UI-TARS 的备选。
4. **Agent S2** (2025, Simular AI) — 分层 GUI Agent 架构，对模块 3 的 planner/actor 分离有参考价值。<https://github.com/simular-ai/Agent-S>
5. **ShowUI** (2025, NUS/Microsoft) — 视觉-语言-action 统一的 GUI agent。
6. **Aguvis** (2025, HKU/Salesforce) — 统一视觉 agent 训练框架。
7. **SeeClick** (2024, NJU) — 早期 GUI grounding 工作，理解坐标-文本映射的起点。
8. **Magma** (2025, Microsoft) — 多模态 agent 基础模型，给"视觉+动作"打底。
9. **cua / trycua** (开源, 2025) — macOS 上的轻量 computer use 实现，可借鉴沙箱设计。<https://github.com/trycua/cua>
10. **self-operating-computer** (开源, OthersideAI) — 早期 GPT-4V 桌面 agent demo。

### 5.2 视觉大模型 / VLM（模块 1、2、6）

11. **Qwen2.5-VL / Qwen3-VL** (2025, Alibaba) — 开源 SOTA VLM，本地 7B 可跑，作为 `VisionQATool` 的高质量后端。
12. **Moondream 2 / 3** (2024–2025) — 1.5B / 2B 超轻量 VLM，端侧首选，Vision-Agents 已集成。
13. **Florence-2** (2024, Microsoft) — 多任务视觉基础模型（caption/detect/seg/ocr 一把梭）。
14. **SigLIP / SigLIP 2** (2024–2025, Google) — 视觉-文本对比模型，用于模块 6 的嵌入。
15. **OmniParser v2** (2025, Microsoft) — 屏幕 → 元素树解析，模块 2 `UIParseTool` 直接用。<https://github.com/microsoft/OmniParser>
16. **ColPali / ColQwen2** (2024–2025, ILLUIN/EPFL) — late-interaction 文档视觉检索，模块 6 PDF/截图 RAG 的基石。

### 5.3 Screenshot-Driven Dev / Design2Code（模块 4）

17. **Design2Code: How Far Are We from Automating Front-End Engineering?** (2024, Stanford) — 模块 4 的核心 benchmark。<https://arxiv.org/abs/2403.03163>
18. **Pix2Code** (2017, FloydHub) — 远古起点，回顾用。
19. **WebSight v2** (2024, HuggingFace) — Sketch→HTML 数据集，可做训练/评测。
20. **WebGen-Bench** (2025) — 网页生成评测。
21. **v0** (Vercel) — 工业界产品形态参考。
22. **screenshot-to-code** (开源, abi/screenshot-to-code) — 开源最广为人知实现，模块 4 直接借其 prompt 工程。<https://github.com/abi/screenshot-to-code>

### 5.4 视觉验证 / Visual Regression（模块 5）

23. **Visual Regression Testing 综述** (业界经验, 非论文) — Percy / Chromatic / Lost-Pixel 工程实践。
24. **UI-Bench / WebShop / VisualWebArena** (CMU 2024) — 浏览器视觉任务评测，模块 5 评测部分用。<https://jykoh.com/vwa>
25. **WebArena** (2023, CMU) — 文本版前置工作，对比基线。

### 5.5 多模态 SWE Agent（项目总愿景）

26. **SWE-bench Multimodal (M-SWE-bench)** (2024, Princeton) — 给定带截图的 issue，agent 改 repo 修 bug；本项目终极对齐目标。<https://www.swebench.com/multimodal.html>
27. **SWE-agent** (2024, Princeton) — 文本版 SOTA agent，结构上对照 claude-code Tool/Command 设计。
28. **OpenHands / OpenDevin** (2024) — 工程实现参考，已有视觉 agent 分支。
29. **Cline / Roo Code** (开源 VSCode agent) — UX 灵感，但 claude-code 已经更完备。

### 5.6 实时视频 Agent（模块 7）

30. **Gemini 2.0/2.5 Live API** (2024–2025, Google) — 实时多模态流。
31. **OpenAI Realtime API** (2024–2025, OpenAI) — 同上。
32. **NVIDIA Cosmos** (2025) — 视频世界模型，Vision-Agents 已集成（高阶 demo 可选）。
33. **Vision-Agents** (2025, GetStream) — **本项目主要被融合对象**。<https://github.com/GetStream/Vision-Agents>

### 5.7 Prompting / Agent Reasoning

34. **Set-of-Mark Prompting** (2023, Microsoft) — 给图标号让 VLM 引用，模块 2 `AnnotateTool` 的依据。
35. **ReAct / Reflexion / Tree-of-Thought** — 基础 agent reasoning paradigm。
36. **Anthropic "Computer use" prompting cookbook** (2024–2025) — 官方 prompt 模板。

---

## 6. 开发计划（4 周 + 1 周缓冲）

> 假设每周投入 ~25h，单人完成。所有节点都给"最小可交付"，不达标先砍 stretch，不砍主线。

### Week 0（前期，3 天，可并行已开始）

- [ ] 通读 `src/Tool.ts` / `src/tools/FileReadTool/*` / `src/QueryEngine.ts` 前 2000 行，画 tool-call 时序图。
- [ ] 通读 `Vision-Agents/agents-core/vision_agents/core/agents/agents.py` 与 `processors/base_processor.py`。
- [ ] 整理 Reading List（已在 §5 完成），跑通 Moondream / Qwen2.5-VL / OmniParser 各一个 demo。
- [ ] 决定 sidecar 协议（JSON-RPC over stdio，参考 LSP 实现，避免端口冲突）。

**产出**：`docs/00_arch_review.md`、`docs/01_sidecar_protocol.md`。

### Week 1：基础设施 + 视觉中台（模块 1）

- **Day 1-2**：在 `src/vision/` 落地 `pipeline.ts` + `sidecar.ts`。spawn 子进程、stdio buffer 拼包、超时/重启。
- **Day 3**：在 `vision_sidecar/` 用 uv 建独立 Python 包，依赖 `vision-agents-core`、`ultralytics`、`moondream`、`pillow`。实现 RPC dispatch（method registry）。
- **Day 4**：把 `Vision-Agents/plugins/moondream` 的 `MoondreamVLM` 暴露为 `vlm.caption` 方法；接上单测。
- **Day 5**：把 `Vision-Agents/plugins/ultralytics` 的 `YOLODetector` 暴露为 `detect.objects`，跑通端到端从 TS 调到 YOLO 返 bbox。
- **Day 6-7**：在 `src/tools/vision/VisionQATool/`、`OCRTool/` 落地两个工具（最小集），接入 permission 系统，写测试。

**Gate**：CLI 里能跑 `claude` → 问 "describe this image: /tmp/test.png" → 走 Moondream 出 caption。

### Week 2：视觉工具家族 + Screenshot-Driven Dev（模块 2、4）

- **Day 1**：`ScreenshotTool`（mac/linux/win 分发到原生命令）+ `AnnotateTool`（sharp 叠 bbox）。
- **Day 2**：`BrowserVisionTool` 基于 playwright（先 mac，CI 用 chromium-headless）。
- **Day 3**：`ImageDiffTool`：pixelmatch + sidecar 里加 `embed.clip` → cosine 双指标。
- **Day 4**：`UIParseTool`：sidecar 集成 OmniParser v2（模型 ~1GB，按需下载 + 缓存）。
- **Day 5-6**：新 command `/design2code`，串起 prompt 模板 → scaffold → 启 dev server → 截图 → diff → 反思。借鉴 `abi/screenshot-to-code` 的 prompt。
- **Day 7**：跑通至少 3 个 Design2Code 样例（taillwind 卡片、登录页、dashboard），手工评估。

**Gate**：`/design2code ./figma.png` 能在 5 轮内输出可访问的 React 页面，与原图相似度（CLIP cosine）≥ 0.75。

### Week 3：GUI Agent + 视觉验证闭环（模块 3、5）

- **Day 1**：`/visual-debug` 命令骨架 + 文件 watcher（chokidar）。
- **Day 2-3**：把视觉回归接到 git hook（pre-push 跑一遍），异常时调用 `VisionQATool` 给出诊断。
- **Day 4**：GUI Agent 第一版——只调 Anthropic Computer Use API（远程派最快出活）。在 docker + xvfb 沙箱里跑。
- **Day 5-6**：本地派——sidecar 集成 UI-TARS-1.5（或 ShowUI，看推理速度），实现 `act.click/type/scroll`。
- **Day 7**：在 mini OSWorld 子集（10 例）上对比远程/本地派成功率。

**Gate**：`/gui "打开 calculator 算 23*17"`、`/visual-debug` 改 CSS 后能正确报"右上角按钮颜色异常"。

### Week 4：视觉 Memory + Live + 评测 + 收尾（模块 6、7 + Eval）

- **Day 1-2**：sidecar 集成 SigLIP2 + LanceDB；`VisionMemorySearchTool` 与 `src/services/extractMemories/` 钩子打通。
- **Day 3**：（stretch）`/live` 模式：屏幕共享 + Gemini Live，仅做 5 分钟 demo 不做生产化。
- **Day 4**：自建 mini-eval 数据集（20 题），脚本 `eval/run_visual_coding.py`。
- **Day 5**：跑 Design2Code 子集（10 题）+ VisualWebArena 子集（10 题），整理结果表。
- **Day 6**：写课程报告 `REPORT.md`（含架构图、消融、案例）。
- **Day 7**：录 demo 视频、整理 README、清理代码、补单测覆盖率到 ≥ 60%。

**Gate**：Eval 报告就绪、demo 视频 ≤ 5 分钟覆盖 3 个核心场景。

### Week 5（缓冲）

- 修 bug、补单测、被砍模块复活、报告打磨。

---

## 7. 评测方案

| 类别 | 数据集 | 规模 | 指标 |
|------|--------|------|------|
| Screenshot→Code | Design2Code 子集 | 10 | CLIP-similarity, MAE 颜色, 人工 1–5 分 |
| Visual Web Task | VisualWebArena 子集 | 10 | task success rate |
| GUI Operation | OSWorld 子集（仅 macOS apps） | 10 | step-level + task-level success |
| 自建 Visual-Coding | 自构 20 例（含 5 个真实 GitHub issue 截图） | 20 | task success + 平均轮数 + 平均成本 |
| 消融 | 关掉本地 VLM / 关掉 ImageDiff / 关掉 reflection | — | 同上 |

所有评测脚本进 `eval/`，结果固化到 `eval/results/*.jsonl` 便于复现。

---

## 8. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| TS↔Python sidecar 协议踩坑（编码、信号、僵尸进程） | 高 | 中 | Week 0 就把协议固化，先写 echo 测试；参考 LSP 实现。 |
| OmniParser / UI-TARS 模型体积大、下载慢 | 中 | 中 | 默认走 Moondream，重型模型按需下载 + 本地缓存。 |
| Anthropic Computer Use API 费用/配额 | 中 | 中 | 默认本地派；远程派加 budget 限制（复用 `cost-tracker.ts`）。 |
| Playwright/headless Chromium 在 macOS arm64 不稳 | 中 | 低 | 已知方案：Playwright 1.45+ 原生支持；CI 用 ubuntu runner。 |
| GUI 操作真实点击造成误操作 | 高 | 高 | 默认 dry-run；`--yolo` 才执行；docker + xvfb 提供安全 sandbox 脚本。 |
| 课程时间 4 周不够 | 中 | 高 | 模块 7（Live） 标记为 stretch，可砍；模块 3 本地派如果不稳就只留远程派。 |
| 与现有 `claude-in-chrome` 重复 | 中 | 低 | 定位互补：chrome skill 是浏览器内 DOM 操作；本项目模块 2/3 是屏幕级 + 本地 VLM。文档明确区分。 |

---

## 9. 目录结构（最终态）

```
claude-code-vision/
├── src/                              # claude-code 原始源码（不动 + 渐进式补丁）
│   ├── tools/
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
│   │   ├── design2code/              # 新 slash 命令
│   │   ├── visual-debug/
│   │   ├── gui/
│   │   └── live/
│   ├── vision/                       # 视觉中台
│   │   ├── pipeline.ts
│   │   ├── sidecar.ts
│   │   └── types.ts
│   └── coordinator/
│       └── gui_agent.ts              # GUI Agent 子 agent
├── vision_sidecar/                   # Python sidecar（uv workspace 复用 Vision-Agents）
│   ├── pyproject.toml
│   ├── vision_sidecar/
│   │   ├── server.py                 # stdio JSON-RPC
│   │   ├── methods/
│   │   │   ├── vlm.py                # Moondream / Qwen2.5-VL
│   │   │   ├── detect.py             # YOLO via Vision-Agents/ultralytics
│   │   │   ├── ui_parse.py           # OmniParser
│   │   │   ├── ocr.py
│   │   │   ├── embed.py              # SigLIP2 / CLIP
│   │   │   └── act.py                # pyautogui + UI-TARS
│   │   └── registry.py
│   └── tests/
├── Vision-Agents/                    # 原始 vendored repo（保持只读，import 其 plugin）
├── eval/
│   ├── design2code/
│   ├── visualwebarena/
│   ├── osworld/
│   ├── visual_coding/
│   └── run.py
├── docs/
│   ├── 00_arch_review.md
│   ├── 01_sidecar_protocol.md
│   ├── 02_tool_specs.md
│   └── 03_gui_agent_design.md
├── scripts/
│   ├── gui_sandbox.sh
│   └── download_models.sh
├── PLAN.md                           # 本文档
├── REPORT.md                         # 课程报告（Week 4 产出）
└── README.md
```

---

## 10. 与课程"完整度"评分对齐

| 评分维度 | 本项目落点 |
|----------|------------|
| 工程完整度 | 7 大模块 + sidecar + 沙箱 + eval + CI |
| 文献融入 | §5 共 36 条引用，覆盖 25–26 年代表作 |
| 开源融入 | 复用 Vision-Agents、OmniParser、Moondream、UI-TARS、screenshot-to-code、playwright 等 |
| 创新性（不强求） | 把"视觉 processor 中台 + GUI Agent + 视觉验证闭环"塞进同一个 CLI 是当前没人正面做的 combo |
| 可复现 | eval 脚本 + LanceDB 本地存 + 模型按需下载脚本 |
| 演示效果 | 3 个 demo + 5 分钟视频 |

---

## 11. 立刻可以开干的下一步（给我自己的 TODO）

1. 跑 `Vision-Agents` 自带 `examples/02_golf_coach_example`，确保本地 uv 环境 + ultralytics + moondream 跑得起来。
2. 跑 `src/` 的 dev 启动（先看 `package.json` / bun 入口），确认能把一个新 Tool 注册进 tool registry。
3. 写 `docs/01_sidecar_protocol.md` 把协议定死，再开 coding。

> 三件事都不超过半天，先开 §11 再开 §6 的 Week 1。
