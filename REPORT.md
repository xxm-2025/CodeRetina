# CodeRetina 课程项目报告

**姓名**：徐新茗　**班级**：日新31　**学号**：2023012484

> 本报告面向课程期末作业提交，围绕项目本身的目标、设计、实现和验证结果展开说明。项目以现有文本型 Code Agent 为基础，扩展面向 Computer Use 场景的视觉感知、UI 解析、GUI 动作规划和视觉验证能力，使 Agent 能够在真实软件环境中观察状态、理解界面，并根据视觉反馈完成任务闭环。

---

## 摘要

现有 Code Agent 已经能够读写代码、运行命令、调用工具和处理文本报错；Computer Use Agent 则进一步尝试在真实电脑环境中点击、输入、滚动和操作应用。但如果要把二者结合成一个能处理真实软件环境的多模态编程 Agent，仅依赖文本上下文是不够的：它还需要知道当前屏幕上有什么、按钮在哪里、操作后状态是否变化、页面是否符合预期，以及历史视觉信息能否被复用。

本项目 CodeRetina 将 `claude-code` 的文本型编程 CLI 扩展为一个面向 Computer Use 场景的多模态编程 Agent。系统通过 TypeScript 主进程和 Python Vision Sidecar 的双进程架构，把截图、OCR、UI 解析、视觉问答、图像差异对比、GUI 动作规划、视频回放和多模态文档检索封装成可组合的 Agent 工具，并接入原有工具调用循环。

项目的核心目标不是单独做 UI 生成，而是解决更通用的问题：

> 当 Agent 要在电脑环境中完成任务时，如何让它稳定地观察环境、理解状态、规划动作、验证结果，并把视觉反馈纳入下一步决策？

项目最终形成了一个以“观察 - 理解 - 规划 - 执行 - 验证 - 记忆”为核心链路的多模态 Agent 原型。视觉上下文与验证层是其中的核心设计；Screenshot-to-Code、Visual Debug、GUI Agent dry-run、Video Replay 和 Doc RAG 都是这套能力链路上的应用场景。

---

## 1. 项目背景与问题定义

### 1.1 背景

大语言模型驱动的 Agent 已经可以完成不少软件开发任务，例如读写代码、运行命令、分析报错和调用工具。但在真实的软件环境中，很多状态并不会只以文本形式出现。网页布局、弹窗、按钮位置、表格、图表、录屏过程以及 PDF 中的图文内容，往往都需要通过视觉信息才能判断。

这使得传统 Code Agent 在一些场景中会遇到限制：它可以修改代码，却不一定知道页面最终渲染得是否正确；它可以给出 GUI 操作建议，却不一定知道按钮实际在哪里；它可以根据终端输出判断程序是否报错，却很难根据截图判断用户界面是否达到预期。因此，本项目尝试把视觉观察和视觉验证接入 Agent 的工作流程，使 Agent 不只依赖文本上下文，也能利用屏幕、图像、视频和文档中的信息。

### 1.2 问题定义

本项目关注的问题是：

> 如何把文本型 Code Agent 扩展为面向 Computer Use 场景的多模态编程 Agent，使其能够把屏幕、图像、视频和文档中的视觉信息转化为可行动、可验证、可复用的结构化上下文？

这个问题可拆成六个子问题：

1. **观察**：如何稳定获取屏幕、网页、图片、视频帧和文档页面。
2. **理解**：如何识别文字、UI 元素、图表、表格和视觉语义。
3. **结构化**：如何把视觉模型输出转成 bbox、置信度、动作计划、diff 区域等可消费数据。
4. **路由**：如何在本地模型、低成本云模型和高能力云模型之间做选择。
5. **验证**：如何判断一次 GUI 操作或代码修改是否真的改变了视觉状态。
6. **复用**：如何把历史截图、视频片段和文档区域变成可检索记忆。

### 1.3 项目目标

结合课程对完整实验或系统项目的要求，本项目的目标不是训练新的视觉模型，而是完成一个可运行、可解释、可扩展的多模态 Agent 系统原型。具体目标包括：

1. 在现有 Code Agent 的工具循环中接入视觉感知能力。
2. 将截图、UI 元素、图表、文档区域等视觉信息转化为结构化上下文。
3. 支持 GUI 任务中的观察、动作规划和结果验证。
4. 通过 Screenshot-to-Code、Visual Debug、Video Replay 和 Doc RAG 等场景展示系统能力。
5. 保持底层视觉模型可替换，便于后续接入不同本地模型或云端模型。

---

## 2. 系统总体设计

### 2.1 与原 Claude Code 的关系

本项目不是从零实现一个新的 Agent，而是在原有 `claude-code` 编程 Agent 的基础上扩展视觉能力。原系统已经具备三类核心能力：

1. **对话和任务编排**：接收用户任务，把任务拆成多轮推理和工具调用。
2. **代码环境操作**：通过文件读写、搜索、编辑、Bash、测试运行等工具修改项目。
3. **工具调用循环**：模型可以根据当前上下文选择工具，读取工具结果，再决定下一步。

这些能力构成了项目的“底座”。本项目保留这个底座，不改变 Agent 的基本工作方式，而是在工具层和运行时旁边加入视觉能力。也就是说，Agent 仍然通过原来的工具循环工作，只是工具箱里多了截图、OCR、UI 解析、视觉问答、图像对比、GUI 规划、视频问答和文档检索等新工具。

可以把整体关系理解为：

```text
原 Claude Code：
用户任务 → Agent 推理 → 调用代码工具 → 读写文件 / 运行命令 → 继续推理

CodeRetina：
用户任务 → Agent 推理 → 调用代码工具或视觉工具
                  │
                  ├── 代码工具：读写文件 / 搜索 / Bash / 测试
                  └── 视觉工具：截图 / OCR / UI 解析 / VQA / Diff / GUI 规划
                         │
                         ▼
                    把屏幕和图像状态转成结构化上下文
```

因此，本项目的核心改动不是替换 Claude Code，而是让原本“只看文本和代码”的 Agent 多了一条“看屏幕和图像”的感知通道。

### 2.2 总体架构

系统由两部分组成：

- **TypeScript Agent 主进程**：负责 CLI 入口、命令解析、工具调用循环、视觉工具封装、路由决策、预算和缓存管理。
- **Python Vision Sidecar**：负责视觉模型、图像处理、UI 检测、嵌入、视频分析、文档解析和 GUI 后端。

两者通过 JSON-RPC over stdio 通信。这个设计保留了 TypeScript CLI 的 Agent 编排能力，同时复用 Python 视觉生态。

```text
┌──────────────────────────────────────────────────────────────┐
│       CodeRetina CLI (TypeScript / Bun)                        │
│                                                              │
│  User Task                                                    │
│  /gui /visual-debug /design2code /replay /doc                 │
│        │                                                     │
│        ▼                                                     │
│  Agent Tool Loop                                              │
│        │                                                     │
│        ├── Code Tools: File / Bash / Search / Edit            │
│        │                                                     │
│        └── Vision Tools                                       │
│             Screenshot / OCR / UIParse / VQA / Diff / RAG     │
│                    │                                         │
│                    ▼                                         │
│          Hybrid Vision Router                                │
│          rule + confidence + budget + cache                  │
└────────────────────┬─────────────────────────────────────────┘
                     │ JSON-RPC over stdio
                     ▼
┌──────────────────────────────────────────────────────────────┐
│             Python Vision Sidecar                             │
│                                                              │
│  vlm.query     ocr.extract       ui.parse      image.diff     │
│  detect.objects embed.image      video.qa      doc.rag        │
│  gui.plan      gui.act           visual.memory                │
│                                                              │
│  Local VLM / OCR / YOLO / OmniParser / Embedding / RAG        │
└──────────────────────────────────────────────────────────────┘
```

**图 1：双进程架构示意。** 上半部分是 TypeScript Agent 主进程，负责命令、工具调用和上下文编排；下半部分是 Python Vision Sidecar，负责视觉模型、图像处理、视频和文档解析。

上半部分仍然是原 Claude Code 所在的 TypeScript CLI 和 Agent 工具系统。新增的视觉工具也以同样的 Tool 形式接入，所以 Agent 不需要学习一套完全不同的调用机制。

下半部分是新增的 Python Vision Sidecar。之所以把视觉部分放到 Python 进程里，是因为 OCR、目标检测、图像处理、视频抽帧、embedding 和 RAG 等生态主要在 Python 中更成熟。TypeScript 主进程负责“什么时候调用视觉能力”，Python sidecar 负责“具体怎么处理图像和模型”。

两者之间用 JSON-RPC over stdio 通信。这样可以把系统边界划清楚：

- TypeScript 侧继续承担 Agent 编排、工具注册、命令入口、上下文管理和结果展示。
- Python 侧集中承担视觉模型调用、图像处理、UI 元素检测、视频和文档解析。
- RPC 协议负责把视觉请求和结构化结果在两个进程之间传递。

### 2.3 中台能力抽象

本项目把视觉能力抽象为六类基础能力：

| 能力 | 作用 | 对 Agent 的价值 |
|------|------|----------------|
| 视觉观察 | 截图、网页截图、抽帧、文档渲染 | 获得当前环境状态 |
| 视觉理解 | VQA、OCR、目标检测、UI 解析 | 把图像转成语义信息 |
| 视觉结构化 | bbox、元素树、区域、置信度、caption | 让后续工具可消费 |
| 动作规划 | click、type、scroll、hotkey、wait | 支持 Computer Use |
| 结果验证 | image diff、状态检查、截图对比 | 判断任务是否成功 |
| 视觉记忆 | embedding、RAG、视频章节、历史截图检索 | 支持跨步骤和跨会话复用 |

这种抽象使项目不局限于某一个 demo。UI 生成、GUI 自动化、视觉调试、视频复盘和文档问答都可以复用同一套底层能力。

---

## 3. 核心模块实现

### 3.1 Vision Sidecar：跨语言视觉服务

视觉模型和图像处理生态主要集中在 Python，而 `claude-code` 主体是 TypeScript。项目使用 sidecar 架构连接两边：

- TypeScript 负责启动和管理 Python 子进程。
- Python 通过方法注册表暴露视觉 RPC 方法。
- 双方使用 `Content-Length + JSON body` 的消息格式。
- 请求支持超时、错误返回和结构化响应。

典型 RPC 方法包括：

```text
vlm.query
vlm.caption
detect.objects
ui.parse
ocr.extract
image.diff
embed.image
rag.search_with_maxsim
video.qa
gui.plan
gui.act
```

这部分的关键不是某个具体模型，而是稳定的工程边界。只要协议稳定，后续就可以替换 MiniCPM-V、Moondream、Qwen-VL、OmniParser、YOLO 或云端 VLM。

### 3.2 Vision Tools：把视觉能力接入 Agent 工具循环

项目把底层视觉 RPC 封装成 Agent 可以调用的工具：

| 工具 | 功能 | 适用场景 |
|------|------|----------|
| `ScreenshotTool` | 捕获屏幕或窗口 | 获取环境状态 |
| `BrowserVisionTool` | 打开网页并截图 | 网页任务验证、UI 检查 |
| `VisionQATool` | 对图片进行问答 | 屏幕理解、设计图理解 |
| `OCRTool` | 识别图片中的文字 | 弹窗、表格、错误信息读取 |
| `UIParseTool` | 识别按钮、输入框、菜单等 UI 元素 | GUI 动作定位 |
| `ImageDiffTool` | 比较两张图片差异 | 操作前后验证、视觉回归 |
| `AnnotateTool` | 绘制 bbox 和标签 | 调试和可解释展示 |
| `VideoQATool` | 抽取关键帧并问答 | 录屏复盘 |
| `DocRAGTool` | 检索 PDF / 图表 / 表格 | 多模态文档理解 |

工具层的设计原则是：**视觉结果必须结构化**。例如 UI 解析返回元素类型、文本、bbox 和置信度；图像 diff 返回差异比例、相似度和差异区域；GUI planning 返回动作类型和参数。这样 Agent 才能把视觉输出接入后续决策。

### 3.3 Hybrid Vision Router：模型选择与成本控制

不同视觉任务对模型能力要求不同。简单 OCR 或截图 caption 可以走本地模型；复杂 GUI 规划和跨区域推理可能需要更强的云端模型。项目实现了 Hybrid Vision Router：

```text
输入视觉任务
  ↓
规则路由：按任务类型选择默认模型 tier
  ↓
执行模型调用
  ↓
置信度不足时升级到更强模型
  ↓
预算不足时降级或使用缓存
  ↓
返回结构化结果
```

三层模型策略：

| Tier | 特点 | 适合任务 |
|------|------|----------|
| Tier 1 本地模型 | 成本低、隐私好、可离线 | OCR、caption、简单检测 |
| Tier 2 低成本云模型 | 性价比高、速度快 | 常规截图问答、页面理解 |
| Tier 3 高能力云模型 | 推理强、成本高 | 复杂 GUI planning、困难 visual debug |

Router 的意义是让视觉层具备工程可用性：不是所有任务都调用最贵模型，也不是盲目依赖本地小模型。

### 3.4 GUI Agent：观察 - 规划 - 执行 - 验证

Computer Use Agent 的核心是对 GUI 环境进行闭环操作。本项目中的 GUI Agent 采用如下流程：

```text
当前截图
  ↓
UIParseTool 识别可交互元素
  ↓
VisionQATool 理解任务相关区域
  ↓
Planner 生成动作计划
  ↓
执行 click / type / scroll / hotkey / wait
  ↓
再次截图
  ↓
ImageDiffTool 或 VQA 验证状态变化
```

动作空间包括：

- `click(x, y)`
- `type(text)`
- `scroll(direction)`
- `hotkey(keys)`
- `wait(ms)`
- `screenshot()`

为了避免误操作，系统默认启用 dry-run，即只输出动作计划，不直接操作真实桌面。需要执行时可显式关闭 dry-run，并放入沙箱环境。

### 3.5 Visual Verification：视觉验证闭环

视觉验证是本项目区别于普通 VLM wrapper 的关键。系统不仅问“图里有什么”，还要判断“操作或代码修改是否达成目标”。

典型验证场景：

- GUI 点击后，目标弹窗是否出现。
- 表单提交后，页面是否进入下一步。
- 代码修改后，网页视觉效果是否变化。
- 设计图和实现页面是否仍有明显差异。
- 录屏中的关键步骤是否被正确复盘。

验证方法包括：

- 截图前后对比。
- 像素级和感知级 image diff。
- UI 元素树变化对比。
- VLM 对关键区域进行问答。
- 历史视觉记忆检索。

### 3.6 Screenshot-to-Code：视觉层的代表应用

Screenshot-to-Code 不是项目唯一目的，而是最直观的应用 demo。它展示了视觉层如何辅助 Code Agent 完成 UI 相关任务：

```text
输入设计图
  ↓
理解布局、颜色、文字和组件
  ↓
生成 React + Tailwind 页面
  ↓
启动浏览器并截图
  ↓
和设计图进行视觉 diff
  ↓
根据差异修改代码
```

这个 demo 能体现“视觉观察”和“视觉验证”对 Code Agent 的价值：Agent 不再只根据代码判断结果，而是能看真实渲染页面。

### 3.7 视频回放与多模态文档

为了验证视觉层的通用性，项目还扩展了两类输入：

- **Video Replay**：对录屏抽帧，生成章节摘要，并支持基于视频内容问答。
- **Doc RAG**：解析 PDF / HTML / Markdown，检测图表、表格和文本区域，生成 patch embedding，并用 MaxSim 检索相关区域。

这说明视觉层不只服务单张截图，也可以处理长时序视觉信息和图文混排文档。

---

## 4. 实现文件结构

项目中与视觉层相关的主要目录包括：`src/tools/vision/` 保存 Agent 可调用的视觉工具；`src/vision/` 保存 sidecar 调用、类型定义和模型路由逻辑；`src/commands/` 保存 `/gui`、`/design2code`、`/replay`、`/doc` 等命令入口；`vision_sidecar/` 保存 Python 视觉服务、方法注册表和具体视觉处理后端；`scripts/` 与 `docs/` 分别保存 demo 脚本和阶段性说明。

```text
CodeRetina/
├── src/
│   ├── tools/vision/      # Screenshot / OCR / VQA / UIParse / Diff / VideoQA / DocRAG
│   ├── vision/            # Sidecar client, router, types, visual memory
│   └── commands/          # /gui /design2code /visual-debug /replay /doc
├── vision_sidecar/        # Python RPC server and visual processing methods
├── scripts/               # Demo and test scripts
└── docs/
```

---

## 5. 实验与验证

### 5.1 实验设计

本项目的验证分三层：

1. **协议和工具单元测试**：检查 JSON-RPC 编解码、路由、缓存、预算、截图和图像处理边界。
2. **模块 demo**：分别演示截图、OCR、UI 解析、GUI planning、视频问答和文档 RAG。
3. **端到端 demo**：展示 Computer Use / Code Agent 的视觉闭环，例如 GUI dry-run 和 Screenshot-to-Code。

实验设计围绕“Agent 是否能够利用视觉信息完成任务”展开。相比只检查模型能否回答图片内容，本项目更关注视觉信息进入工具链之后，是否能支持后续规划、执行和验证。

### 5.2 测试关注点

测试重点放在三类风险上：第一是工程协议风险，例如 JSON-RPC 的中文多字节字符、粘包半包、错误响应和 sidecar 进程异常；第二是视觉结构化风险，例如 UI 元素 bbox 错误、置信度过低、图像尺寸不一致和文档区域检测错误；第三是 Agent 闭环风险，例如 GUI dry-run 的安全边界、动作后状态验证、模型路由的预算控制和缓存命中逻辑。

### 5.3 代表性实验场景

本项目选择以下场景作为代表性实验：

1. **GUI dry-run**：输入一个 GUI 操作任务，系统先截图并解析 UI 元素，再输出点击、输入、滚动等动作计划。该场景验证系统能否把屏幕状态转化为可执行计划。
2. **Screenshot-to-Code**：输入参考设计图，生成前端页面后启动浏览器截图，并与参考图进行视觉 diff。该场景验证 Code Agent 能否利用视觉反馈改进代码结果。
3. **Visual Debug**：对页面截图或错误截图进行问答和区域定位，帮助 Agent 理解视觉 bug 或异常状态。
4. **Video Replay**：对录屏抽取关键帧并生成摘要，支持围绕操作过程进行问答。该场景验证系统对长时序视觉输入的处理能力。
5. **Doc RAG**：对包含图表和表格的文档进行区域解析和检索，回答与图文内容相关的问题。

这些实验共同说明：项目不是单一的 UI 生成工具，而是一套可复用于屏幕、网页、录屏和图文文档的视觉上下文与验证层。

### 5.4 结果分析

从实验结果看，系统能够完成从视觉输入到结构化上下文、再到动作规划或结果验证的基本链路。GUI dry-run 可以输出包含动作类型和坐标位置的计划；Screenshot-to-Code 可以通过浏览器截图和图像差异对比发现实现与参考图之间的偏差；Video Replay 和 Doc RAG 则说明同一套视觉处理链路可以扩展到视频和图文文档。

同时，实验也暴露出一些限制：视觉模型对小字号、密集表格和复杂遮挡场景仍然不稳定；纯像素 diff 容易受到字体渲染和浏览器差异影响；真实 GUI 执行还会受到系统权限、窗口位置和环境状态影响。因此，本项目更适合作为课程项目中的系统原型和能力验证，而不是直接用于高风险的无人值守 GUI 自动化。

---

## 6. 项目成果

### 6.1 已完成内容

项目已完成 TypeScript 视觉工具层、Python Vision Sidecar、JSON-RPC over stdio 通信协议和 Hybrid Vision Router，并实现了 Screenshot、OCR、VQA、UIParse、ImageDiff、Annotate、VideoQA、DocRAG 等工具。基于这些模块，系统支持 GUI Agent dry-run、Screenshot-to-Code 视觉验证、Video Replay 和多模态 Doc RAG 等代表场景，并配套了 demo 脚本和测试设计。

### 6.2 项目特点

本项目的特点主要体现在系统集成上。视觉能力没有作为一个独立的图片问答模块存在，而是被放入 Agent 原有的工具调用流程中：Agent 可以先获取截图或文档页面，再解析其中的文字、UI 元素和区域信息，随后根据这些结构化结果继续规划动作或验证结果。因此，项目关注的不只是“看懂一张图”，而是让视觉信息参与到多轮任务执行中。

另一个特点是输入类型比较丰富。除了单张截图外，系统还尝试处理网页截图、GUI 状态、录屏关键帧和图文文档。这使得 Screenshot-to-Code、GUI dry-run、Video Replay 和 Doc RAG 能够共用同一套视觉工具和 sidecar 架构，而不是为每个 demo 单独写一套流程。

### 6.3 技术难点与局限

项目实现过程中主要有三类难点。第一是跨语言通信稳定性：TypeScript 主进程与 Python Sidecar 通过 stdio JSON-RPC 通信，需要处理 `Content-Length` 的 UTF-8 字节计算、粘包半包、日志不能污染 stdout、模型调用超时和子进程异常恢复。第二是视觉结果结构化：Computer Use Agent 不能只接收“按钮在右上角”这类自然语言描述，而需要 bbox、置信度、元素类型、diff 区域和动作参数等可继续被工具消费的数据。第三是观察与验证闭环：系统不仅要回答“图里有什么”，还要在操作或代码修改后重新观察环境，并用 image diff、UI 元素变化或 VQA 判断目标状态是否达成。

当前系统仍然是课程项目原型，存在一些局限：真实桌面 GUI 执行受权限、窗口状态和平台差异影响较大；基础 image diff 对字体、抗锯齿和浏览器渲染差异较敏感；benchmark 规模还不够大；本地视觉模型首次加载较慢。后续可以重点加强固定 benchmark、视觉调用 trace、layout-level diff 和更严格的 GUI 状态机，使系统从 demo 验证进一步走向更稳定的 Computer Use Agent 基础设施。

---

## 7. 总结

本项目完成了一个面向 Computer Use 场景的多模态编程 Agent 原型。它把截图、OCR、UI 解析、视觉问答、图像 diff、GUI 动作规划、视频问答和文档 RAG 统一封装为 Agent 工具，并通过视觉上下文与验证层，使 Agent 能够从“只会读写文本和代码”扩展到“能够观察电脑环境并根据视觉反馈闭环行动”。

从课程项目角度看，本项目覆盖了跨语言通信、工具系统设计、视觉模型路由、GUI 自动化、图像处理、RAG 和测试验证等多个工程主题。项目最重要的收获是：多模态 Agent 的核心不是简单调用视觉模型，而是把视觉能力组织成稳定、结构化、可组合、可验证的系统基础设施。

---

## 参考资料

1. Anthropic Computer Use：面向电脑环境操作的 Agent 能力。
2. UI-TARS：GUI Agent 与屏幕操作模型。
3. OmniParser：UI 元素解析。
4. MiniCPM-V / Moondream / Qwen-VL：视觉语言模型。
5. RouteLLM / FrugalGPT：模型路由与成本控制。
6. Design2Code：设计图到前端代码任务。
7. OSWorld / VisualWebArena：Computer Use 与网页视觉任务评测。
8. ColPali / ColQwen2：多模态文档检索。

---

## 附录：源码提交说明

课程要求提交相关实验或系统的源代码。本项目可以采用 GitHub 仓库链接作为源码提交方式。建议仓库中至少包含：

1. TypeScript 主进程代码：`src/`。
2. Python Vision Sidecar：`vision_sidecar/`。
3. Demo 脚本：`scripts/`。
4. 项目文档和课程报告：`README.md`、`REPORT.md`、`docs/`。
5. 运行说明：环境依赖、模型/API 配置、常用命令和 demo 入口。

如果不希望公开某些大文件、生成结果或临时测试数据，可以通过 `.gitignore` 排除后再提交。
