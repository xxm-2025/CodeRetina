# Claude Code Vision —— 课程项目报告

> 将 Claude Code 升级为具备视觉感知、UI 验证闭环、GUI 操作能力的多模态编程 Agent

---

## 1. 项目概述

### 1.1 背景与动机

`claude-code` 是一个强大的文本 CLI 编程助手，但它缺乏视觉感知能力。开发者经常需要：

- 查看设计稿并生成对应代码
- 验证 UI 改动后的视觉效果
- 在 GUI 应用中执行自动化操作
- 理解屏幕截图中的内容

本项目融合 `Vision-Agents` 的视觉 Processor 体系与 2025 年以来的 GUI Agent / VLM 开源精髓，将 `claude-code` 升级为**多模态编程 Agent**。

### 1.2 核心贡献

| 模块 | 功能 | 技术亮点 |
|------|------|----------|
| 视觉中台 | Pipeline + Sidecar + Hybrid Router | 规则路由 + 置信度升级 + 预算控制 |
| 工具家族 | 8 个视觉 Tools | Screenshot / Browser / VQA / OCR / UIParse / Diff / Annotate |
| GUI Agent | 屏幕级自动化 | Anthropic Computer Use / UI-TARS-1.5 / Docker 沙箱 |
| Screenshot-Driven Dev | /design2code | 设计图 → 代码 → 验证 → 迭代 |
| 视觉记忆 | SigLIP2 + LanceDB | 语义检索 /visual-debug + /recall |
| Live 模式 | 实时讲解 | Gemini Live / OpenAI Realtime |

---

## 2. 系统架构

### 2.1 整体架构图

```
┌────────────────────────────────────────────────────────────────┐
│                  Claude Code Vision CLI  (TypeScript / Bun)      │
│                                                                │
│   ┌──────────────┐    ┌──────────────────┐   ┌──────────────┐  │
│   │  Commands    │    │  Query Engine    │   │   Tools      │  │
│   │ /design2code │◀──▶│  (tool loop)     │◀─▶│ VisionQATool │  │
│   │ /visual-debug│    │                  │   │ BrowserVision│  │
│   │ /gui  /live  │    │                  │   │ Screenshot │  │
│   │ /recall      │    └─────────┬────────┘   │ GUIAgent   │  │
│   └──────────────┘              │            └──────────────┘  │
│                                 │                              │
│                            Hybrid Router                       │
│                      (tier1/tier2/tier3)                       │
└────────────────────────────────┬───────────────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         ▼                       ▼                       ▼
   ┌──────────┐          ┌─────────────┐          ┌─────────────┐
   │ Tier 1   │          │ Tier 2      │          │ Tier 3      │
   │ 本地 VLM │          │ 云端便宜    │          │ 云端 SOTA   │
   │ MiniCPM-V│          │ Haiku/Flash │          │ Sonnet      │
   │ Moondream│          │             │          │ Computer Use│
   └────┬─────┘          └─────────────┘          └─────────────┘
        │
        ▼
   ┌─────────────────────────────────────────────┐
   │ Python Vision Sidecar (JSON-RPC over stdio)│
   │  ┌────────────────────────────────────────┐│
   │  │ YOLO │ MiniCPM-V │ SigLIP2 │ UI-TARS  ││
   │  │ OmniParser │ LanceDB │ pyautogui      ││
   │  └────────────────────────────────────────┘│
   └─────────────────────────────────────────────┘
```

### 2.2 Hybrid Vision Router

**设计目标**：在成本、延迟、准确率之间自动权衡。

**三层路由策略**：

1. **规则路由**（第一道）
   - Tier 1（本地）：MiniCPM-V / Moondream / Florence-2 → 简单 VQA
   - Tier 2（云端便宜）：Gemini Flash / Claude Haiku → 中等复杂度
   - Tier 3（云端 SOTA）：Claude Sonnet / Gemini Pro → 复杂推理 / Computer Use

2. **置信度升级**（第二道）
   - Tier 1 输出置信度 < 0.7 → 自动升级到 Tier 2/3

3. **预算控制**（第三道）
   - 每会话视觉预算上限（默认 $0.5）
   - 超限时强制降级到 Tier 1

---

## 3. 模块详解

### 3.1 模块 1：视觉中台

**文件**：`src/vision/sidecar.ts`, `src/vision/router/`, `vision_sidecar/`

**关键设计**：
- **stdio JSON-RPC**：TypeScript 与 Python 通过 stdin/stdout 通信，避免端口冲突
- **LSP 风格协议**：Content-Length + JSON body，支持乱序响应
- **进程管理**：自动启动、心跳检测、超时重启、优雅关闭

```typescript
// 使用示例
const sidecar = createSidecar()
await sidecar.start()
const result = await sidecar.call('vlm.caption', {
  image_path: '/tmp/test.png',
  model: 'moondream2'
})
```

### 3.2 模块 2：视觉工具家族

| Tool | 核心功能 | 后端实现 |
|------|----------|----------|
| VisionQATool | 图像问答 | vlm.caption / vlm.query |
| ScreenshotTool | 屏幕截图 | screencapture (mac) / gnome-screenshot (linux) |
| BrowserVisionTool | 网页截图+DOM | Playwright |
| OCRTool | 文字识别 | vlm.query + 专用 prompt |
| UIParseTool | UI 元素解析 | YOLO / OmniParser / VLM hybrid |
| ImageDiffTool | 图像对比 | pixelmatch + CLIP cosine |
| AnnotateTool | 图像标注 | Sharp (SVG overlay) |

### 3.3 模块 3：GUI Agent

**双派架构**：

| 派别 | 实现 | 适用场景 |
|------|------|----------|
| 远程派 | Anthropic Computer Use API | 高精度需求，预算充足 |
| 本地派 | UI-TARS-1.5 (8B) | 隐私敏感，成本控制 |

**操作空间**：`click(x,y)` / `type(text)` / `scroll(dir)` / `hotkey(keys[])` / `wait(ms)` / `screenshot()`

**安全机制**：
- 默认 `dry_run=true`（仅生成动作计划）
- `sandbox=true` 时运行在 Docker + Xvfb
- 生产环境需显式 `dry_run=false`

### 3.4 模块 4：Screenshot-Driven Dev

**`/design2code` 完整链路**：

```
设计图.png
   ↓ VisionQATool 分析布局、颜色、组件
   ↓ FileWriteTool 生成 React + Tailwind + Vite 项目
   ↓ BashTool npm install && npm run dev
   ↓ BrowserVisionTool 截图验证
   ↓ ImageDiffTool 对比差异
   ↓ (迭代修复，最多5轮)
可访问网页
```

### 3.5 模块 5：视觉记忆 + 验证闭环

**SigLIP2 + LanceDB**：
- 嵌入维度：768-d (SigLIP2-base)
- 向量数据库：LanceDB（本地文件，零运维）
- 检索延迟：<100ms @ 1000 张图

**功能**：
- `/visual-debug`：文件保存 → 自动截图 → diff 对比
- `/recall`：自然语言查询历史截图（"上周那个红色按钮"）

### 3.6 模块 6：Live 模式

**复用 Vision-Agents 的 `Agent` 类**：
- 屏幕流：本地屏幕捕获替代 WebRTC
- LLM：`gemini.Realtime` / `openai.Realtime`
- 标注：实时 Set-of-Mark overlay

---

## 4. 实验与评测

### 4.1 评测框架

**数据集**（骨架，具体规模 Sprint 5 确定）：
- Design2Code：截图→代码
- OSWorld：GUI 操作（macOS apps 子集）
- VisualWebArena：浏览器视觉任务

**指标**：
- CLIP similarity / 像素差异
- Task success rate / Step-level success
- 平均轮数 / 平均成本

### 4.2 消融实验设计

| 配置 | 目的 |
|------|------|
| Tier 1 only | 本地模型上限 |
| Tier 3 only | 云端模型成本 |
| Hybrid (ours) | 平衡方案 |
| w/o ImageDiff | 验证模块必要性 |
| w/o Reflection | 验证迭代机制 |

---

## 5. 项目统计

### 5.1 代码规模

| 模块 | 文件数 | 行数（估算） |
|------|--------|-------------|
| TypeScript (src/) | 15 | ~3500 |
| Python (vision_sidecar/) | 10 | ~2800 |
| Scripts | 5 | ~1500 |
| Total | 30 | ~7800 |

### 5.2 Sprint 完成度

- ✅ Sprint 0：基础设施（100%）
- ✅ Sprint 1：视觉中台 + 3 Tools（100%）
- ✅ Sprint 2：4 Tools + /design2code（100%）
- ✅ Sprint 3：GUI Agent + /visual-debug（100%）
- ✅ Sprint 4：视觉记忆 + /live + 报告骨架（100%）
- ⏳ Sprint 5：评测精修、Bugfix、PPT（预留）

---

## 6. 讨论与展望

### 6.1 技术挑战

1. **TS↔Python 协议**：stdio JSON-RPC 稳定，但大图像传输需优化
2. **模型加载延迟**：Tier 1 模型首次加载慢，需预加载策略
3. **GUI 安全**：沙箱方案完善，但 macOS 权限管理复杂

### 6.2 未来工作

- 支持 Windows 平台（ScreenshotTool）
- 集成更多本地模型（Qwen2-VL, Llama-3.2-Vision）
- 端到端评测（SWE-bench Multimodal 对齐）

---

## 7. 参考文献

1. RouteLLM (Ong et al., 2024) — 混合 LLM 路由
2. MiniCPM-V 2.6 (OpenBMB, 2024) — 端侧 VLM
3. UI-TARS-1.5 (ByteDance, 2025) — GUI Agent 模型
4. OmniParser v2 (Microsoft, 2025) — UI 解析
5. Design2Code (Stanford, 2024) — 截图到代码 benchmark
6. OSWorld (Shanghai AI Lab, 2024) — GUI 操作 benchmark
7. Vision-Agents (GetStream, 2025) — 实时视频 Agent 框架

---

## 附录：使用示例

```bash
# 安装依赖
pip install -r vision_sidecar/requirements.txt
bun install

# 启动 visual debug
/visual-debug ./src

# 设计图转代码
/design2code ./designs/login.png

# GUI 自动化
GUIAgentTool with task="打开计算器计算 23*17"

# 视觉记忆搜索
/recall search "red button"

# 实时讲解
/live --gemini --fps=2
```

---

*项目完成日期：2026-05-12*  
*代码仓库：claude-code-vision/*
