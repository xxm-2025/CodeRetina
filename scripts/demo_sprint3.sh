#!/bin/bash
#
# Sprint 3 Demo 脚本
#
# 演示内容：
# 1. /visual-debug —— 文件监听 + 自动截图 + diff
# 2. GUI Agent —— mock 模式演示
# 3. GUI Sandbox —— Docker 环境（可选）
#
# Sprint: S3-5
# 创建日期: 2026-05-12

set -e

# 颜色
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEMO_DIR="$PROJECT_DIR/demo_sprint3"

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║         Claude Code Vision — Sprint 3 Demo                 ║"
echo "║  Visual Debug + GUI Agent (Local/Remote)                 ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# 检查环境
echo -e "${BLUE}Step 0: 检查环境${NC}"
cd "$PROJECT_DIR"

# 创建 demo 目录
mkdir -p "$DEMO_DIR"

command -v python3 >/dev/null 2>&1 || { echo "❌ 需要 python3"; exit 1; }
echo "✓ Python3 可用"

# 检查 chokidar
if npm list chokidar 2>/dev/null | grep -q chokidar; then
    echo "✓ chokidar 已安装"
else
    echo "⚠️  chokidar 未安装，演示将使用 Python watchdog"
fi

# 检查 Docker（可选）
if command -v docker &> /dev/null; then
    echo "✓ Docker 可用（GUI Sandbox 功能可用）"
    HAS_DOCKER=true
else
    echo "⚠️  Docker 未安装，跳过 Sandbox 演示"
    HAS_DOCKER=false
fi

# 测试 1: Visual Debug (模拟)
echo -e "\n${BLUE}Step 1: /visual-debug 功能模拟${NC}"

# 创建测试项目结构
TEST_PROJECT="$DEMO_DIR/test-project"
mkdir -p "$TEST_PROJECT/src"

cat > "$TEST_PROJECT/src/App.jsx" << 'EOF'
import React from 'react'

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Hello Sprint 3!</h1>
        <p>Edit src/App.jsx and save to test visual debug.</p>
        <button>Click me</button>
      </header>
    </div>
  )
}

export default App
EOF

echo "→ 测试项目已创建: $TEST_PROJECT"
echo "  文件: src/App.jsx"

# 使用 Python 模拟文件监听
echo ""
echo "→ 模拟文件监听 (Python watchdog)..."

python3 << 'PYEOF'
import time
import os
from pathlib import Path

# 模拟文件变化通知
print("启动文件监听器...")
print(f"监听目录: '"$TEST_PROJECT"'")
print("文件模式: **/*.{tsx,jsx,css,scss,html}")
print("")
print("模拟场景: 用户修改 App.jsx")
print("-" * 40)

time.sleep(1)

# 模拟修改文件
file_path = Path("'"$TEST_PROJECT"'/src/App.jsx")
content = file_path.read_text()
content = content.replace("Hello Sprint 3!", "Hello Visual Debug!")
file_path.write_text(content)

print(f"[CHANGE] {file_path}")
print("  ↓ 检测到文件变化")
print("  ↓ 延迟 1s（等待文件写入完成）")

time.sleep(1)

print("  ↓ 触发 BrowserVisionTool 截图")
print("  ↓ URL: http://localhost:5173")
print("  ↓ 保存: .visual-debug/1234567890/screenshot_1234567890.png")

time.sleep(0.5)

print("  ↓ 对比 ImageDiffTool")
print("  ↓ 像素差异: 12.5%")
print("  ↓ 语义相似度: 89%")
print("")
print("-" * 40)
print("✓ Visual Debug 流程完成")
PYEOF

# 测试 2: GUI Agent
echo -e "\n${BLUE}Step 2: GUI Agent 功能${NC}"

echo "→ 测试 GUI Agent mock 模式"

python3 << 'PYEOF'
import json

# 模拟 GUI Agent 执行
print("GUI Agent Task: '打开计算器计算 23*17'")
print("")
print("Backend: mock (dry-run mode)")
print("Safety: ✅ dry_run=true (仅生成计划，不执行)")
print("")

# 模拟动作序列
actions = [
    {"step": 1, "action": "screenshot", "desc": "获取当前屏幕"},
    {"step": 2, "action": "click", "x": 100, "y": 100, "desc": "点击 Launchpad"},
    {"step": 3, "action": "type", "text": "计算器", "desc": "搜索 Calculator"},
    {"step": 4, "action": "wait", "ms": 500, "desc": "等待搜索结果"},
    {"step": 5, "action": "click", "x": 200, "y": 150, "desc": "打开 Calculator 应用"},
    {"step": 6, "action": "wait", "ms": 1000, "desc": "等待应用启动"},
    {"step": 7, "action": "click", "x": 300, "y": 300, "desc": "点击数字 2"},
    {"step": 8, "action": "click", "x": 320, "y": 300, "desc": "点击数字 3"},
    {"step": 9, "action": "click", "x": 400, "y": 200, "desc": "点击 * 按钮"},
    {"step": 10, "action": "click", "x": 340, "y": 300, "desc": "点击数字 1"},
    {"step": 11, "action": "click", "x": 360, "y": 300, "desc": "点击数字 7"},
    {"step": 12, "action": "click", "x": 400, "y": 400, "desc": "点击 = 按钮"},
    {"step": 13, "action": "screenshot", "desc": "获取结果屏幕"},
    {"step": 14, "action": "done", "desc": "任务完成"},
]

print("生成动作计划:")
print("-" * 60)
for a in actions:
    if a["action"] == "click":
        print(f"  {a['step']:2d}. {a['action']:10s} ({a.get('x', 0)}, {a.get('y', 0)}) - {a['desc']}")
    elif a["action"] == "type":
        print(f"  {a['step']:2d}. {a['action']:10s} \"{a.get('text', '')}\" - {a['desc']}")
    elif a["action"] == "wait":
        print(f"  {a['step']:2d}. {a['action']:10s} {a.get('ms', 0)}ms - {a['desc']}")
    else:
        print(f"  {a['step']:2d}. {a['action']:10s} - {a['desc']}")
print("-" * 60)

print("")
print("后端对比:")
print("  ┌─────────────┬──────────────┬─────────────┐")
print("  │ 后端        │ 延迟         │ 成本        │")
print("  ├─────────────┼──────────────┼─────────────┤")
print("  │ anthropic   │ ~2000ms      │ $0.05/step  │")
print("  │ uitars      │ ~500ms       │ 本地计算    │")
print("  │ mock        │ 0ms          │ 免费        │")
print("  └─────────────┴──────────────┴─────────────┘")

print("")
print("安全机制:")
print("  • 默认 dry_run=true（仅生成计划）")
print("  • sandbox=true 时运行在 Docker 容器")
print("  • 生产环境需显式设置 dry_run=false")
PYEOF

# 测试 3: GUI Sandbox (如果 Docker 可用)
if [ "$HAS_DOCKER" = true ]; then
    echo -e "\n${BLUE}Step 3: GUI Sandbox (Docker)${NC}"

    echo "→ 检查 Sandbox 脚本..."

    if [ -f "$PROJECT_DIR/scripts/gui_sandbox.sh" ]; then
        echo "✓ gui_sandbox.sh 存在"
        echo ""
        echo "可用命令:"
        echo "  ./scripts/gui_sandbox.sh start    # 启动沙箱"
        echo "  ./scripts/gui_sandbox.sh vnc      # VNC 连接信息"
        echo "  ./scripts/gui_sandbox.sh stop     # 停止沙箱"
        echo ""
        echo "Docker 镜像包含:"
        echo "  • Ubuntu 22.04"
        echo "  • Xvfb + Fluxbox (窗口管理器)"
        echo "  • VNC 服务器"
        echo "  • Python + PyAutoGUI"
        echo "  • Chrome + Firefox"
    else
        echo "⚠️  gui_sandbox.sh 不存在"
    fi
else
    echo -e "\n${BLUE}Step 3: GUI Sandbox (跳过)${NC}"
    echo "Docker 未安装，跳过 Sandbox 演示"
fi

# 测试 4: Python sidecar GUI 方法
echo -e "\n${BLUE}Step 4: Python Sidecar GUI 方法${NC}"

python3 << 'PYEOF'
import sys
sys.path.insert(0, "'"$PROJECT_DIR"'/vision_sidecar")

from vision_sidecar.methods.gui import click, type_text, screenshot

async def test():
    print("→ 测试 gui.click (mock mode)")
    result = await click(100, 200)
    print(f"  Result: {result}")

    print("")
    print("→ 测试 gui.type (mock mode)")
    result = await type_text("Hello GUI!")
    print(f"  Result: {result}")

    print("")
    print("→ 测试 gui.execute (mock mode)")
    from vision_sidecar.methods.gui import execute
    result = await execute("打开计算器", max_steps=5)
    print(f"  Task: {result['task']}")
    print(f"  Steps: {result['steps']}")
    print(f"  Actions: {len(result['actions'])}")

import asyncio
asyncio.run(test())
PYEOF

# 总结
echo -e "\n${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}                     Sprint 3 Demo 完成                      ${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Sprint 3 完成项:"
echo "  ✓ /visual-debug Command —— chokidar 监听 + 自动截图 + diff"
echo "  ✓ GUIAgentTool —— 支持 anthropic/uitars/mock 三种后端"
echo "  ✓ GUI Sandbox —— Docker + Xvfb 安全环境脚本"
echo "  ✓ vision_sidecar/gui.py —— UI-TARS 集成骨架"
echo "  ✓ 安全机制 —— dry-run 默认 + sandbox 隔离"
echo ""
echo "关键设计:"
echo "  • Visual Debug: 文件变化 → 延迟 → 截图 → 对比"
echo "  • GUI Agent: 任务描述 → 模型推理 → 动作序列 → 执行"
echo "  • 安全优先: 默认 dry-run，生产环境需显式开启"
echo ""
echo "下一里程碑:"
echo "  • Sprint 4: SigLIP2 + LanceDB + /live 模式 + 报告"
echo ""
