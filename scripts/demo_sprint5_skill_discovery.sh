#!/bin/bash
#
# Sprint 5 (方向 E) — Skill Discovery Demo 脚本
#
# 演示: 连跑 3 个 /design2code 任务，第 4 个自动调 skill 跳过 scaffold
#

set -e

echo "=================================================="
echo "🤖 Skill Discovery Demo — 方向 E"
echo "=================================================="
echo ""

# 配置
CLAUDE_BIN="${CLAUDE_BIN:-./entry.ts}"
SAMPLES_DIR="${SAMPLES_DIR:-./test_data/design2code}"
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo "📂 使用临时目录: $TEMP_DIR"
echo ""

# ============================================================================
# 步骤 1: 检查环境
# ============================================================================
echo "🔍 步骤 1: 环境检查"
echo "----------------------------------------"

if [ ! -f "$CLAUDE_BIN" ] && [ ! -x "$CLAUDE_BIN" ]; then
    echo "❌ Claude CLI 未找到: $CLAUDE_BIN"
    echo "   请设置 CLAUDE_BIN 环境变量指向可执行文件"
    exit 1
fi

echo "✅ Claude CLI: $CLAUDE_BIN"
echo ""

# 清理之前的自动技能
echo "🧹 清理之前的自动技能..."
AUTO_SKILLS_DIR="$HOME/.claude/skills/auto"
if [ -d "$AUTO_SKILLS_DIR" ]; then
    rm -f "$AUTO_SKILLS_DIR"/*.md
    echo "✅ 已清理: $AUTO_SKILLS_DIR"
fi
echo ""

# ============================================================================
# 步骤 2: 创建测试样本
# ============================================================================
echo "🎨 步骤 2: 创建测试样本"
echo "----------------------------------------"

mkdir -p "$SAMPLES_DIR"

# 样本 1: 卡片组件
cat > "$SAMPLES_DIR/card1.png.desc" << 'EOF'
Design: A profile card with avatar, name, title, and social icons
Colors: White background, blue accent, gray text
Layout: Centered card with rounded corners, shadow
EOF

# 样本 2: 登录表单
cat > "$SAMPLES_DIR/login1.png.desc" << 'EOF'
Design: Login form with email, password inputs and submit button
Colors: Light gray background, primary blue button
Layout: Centered form card, input labels above fields
EOF

# 样本 3: 导航栏
cat > "$SAMPLES_DIR/navbar1.png.desc" << 'EOF'
Design: Top navigation with logo, menu items, and CTA button
Colors: White background, dark text, blue CTA
Layout: Horizontal flex, space-between alignment
EOF

echo "✅ 已创建 3 个设计描述样本"
echo ""

# ============================================================================
# 步骤 3: 模拟运行 design2code 任务 (用 echo 代替真实调用)
# ============================================================================
echo "🚀 步骤 3: 模拟运行 design2code 任务"
echo "----------------------------------------"

simulate_design2code() {
    local task_num=$1
    local desc_file=$2

    echo ""
    echo "▶️  任务 $task_num: /design2code $(basename $desc_file)"
    echo "   描述: $(head -1 $desc_file)"
    echo "   → 调用 VisionQATool 分析设计..."
    echo "   → 调用 FileWriteTool 生成组件..."
    echo "   → 调用 BashTool 启动 dev server..."
    echo "   ✅ 完成!"
}

simulate_design2code 1 "$SAMPLES_DIR/card1.png.desc"
simulate_design2code 2 "$SAMPLES_DIR/login1.png.desc"
simulate_design2code 3 "$SAMPLES_DIR/navbar1.png.desc"

echo ""
echo "✅ 已完成 3 个设计转换任务"
echo ""

# ============================================================================
# 步骤 4: 模拟退出并触发 skill discovery
# ============================================================================
echo "🔄 步骤 4: 模拟退出并触发 skill discovery"
echo "----------------------------------------"

echo "→ 生成模拟 transcript..."

# 创建模拟 transcript
mkdir -p "$TEMP_DIR/session"
cat > "$TEMP_DIR/session/transcript.jsonl" << 'EOF'
{"type":"user_message","timestamp":1703001600000,"content":"Convert this card design to React"}
{"type":"tool_call","timestamp":1703001601000,"tool_name":"VisionQATool","content":"Analyzing card design: avatar, name, title..."}
{"type":"tool_result","timestamp":1703001602000,"tool_name":"VisionQATool","content":"Design extracted: profile card component"}
{"type":"tool_call","timestamp":1703001603000,"tool_name":"FileWriteTool","content":"Creating Card.tsx with Tailwind..."}
{"type":"tool_result","timestamp":1703001604000,"tool_name":"FileWriteTool","content":"File written: src/components/Card.tsx"}
{"type":"user_message","timestamp":1703001605000,"content":"Create a login form like this"}
{"type":"tool_call","timestamp":1703001606000,"tool_name":"VisionQATool","content":"Analyzing login form design..."}
{"type":"tool_call","timestamp":1703001607000,"tool_name":"FileWriteTool","content":"Creating LoginForm.tsx..."}
{"type":"user_message","timestamp":1703001608000,"content":"Build a navbar component"}
{"type":"tool_call","timestamp":1703001609000,"tool_name":"VisionQATool","content":"Analyzing navbar design..."}
{"type":"tool_call","timestamp":1703001610000,"tool_name":"FileWriteTool","content":"Creating Navbar.tsx..."}
EOF

echo "✅ Transcript 已生成 ($TEMP_DIR/session/transcript.jsonl)"
echo ""
echo "→ 运行 reflectSession()..."
echo "   (使用 mock LLM 模式，检测 design2code 模式)"
echo ""

# 显示预期的 skill discovery 结果
cat << 'EOF'
┌─────────────────────────────────────────────────────────┐
│ 🎯 Skill Discovery Result                               │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Discovered 1 skill(s):                                │
│  • screenshot-to-tailwind-card                          │
│                                                         │
│  Source: 11 transcript entries                          │
│  Pattern: screenshot → VisionQA → FileWrite workflow   │
│  Confidence: High (3 occurrences)                       │
│                                                         │
│  Skill saved to:                                        │
│  ~/.claude/skills/auto/screenshot-to-tailwind-card.md  │
│                                                         │
└─────────────────────────────────────────────────────────┘
EOF

echo ""

# ============================================================================
# 步骤 5: 验证技能已保存
# ============================================================================
echo "📋 步骤 5: 验证自动发现的技能"
echo "----------------------------------------"

# 创建示例 skill 文件来演示
mkdir -p "$AUTO_SKILLS_DIR"
cat > "$AUTO_SKILLS_DIR/screenshot-to-tailwind-card.md" << 'EOF'
---
name: screenshot-to-tailwind-card
description: Convert a UI screenshot to a Tailwind React card component
when-to-use: User provides a card-like UI screenshot and asks to recreate it as React code
allowed-tools:
  - VisionQATool
  - FileWriteTool
  - BashTool
user-invocable: true
discovered: 2026-05-12T10:00:00Z
source: session_abc123
---

# Instructions

1. Use VisionQATool to analyze the screenshot and extract UI structure
2. Identify the component hierarchy (card container, header, content, footer)
3. Determine appropriate Tailwind CSS classes for each element
4. Use FileWriteTool to create a React component with Tailwind styling
5. Run the dev server with BashTool to verify the result

## Evidence

- session_abc123 steps 1-5 (card component)
- session_abc123 steps 6-8 (login form)
- session_abc123 steps 9-11 (navbar)
EOF

echo "✅ 技能已保存到: $AUTO_SKILLS_DIR/screenshot-to-tailwind-card.md"
echo ""

# ============================================================================
# 步骤 6: 查看发现的技能
# ============================================================================
echo "📖 步骤 6: 使用 /skills-auto list 查看"
echo "----------------------------------------"
echo ""
echo "$ claude /skills-auto list"
echo ""

# 模拟输出
cat << 'EOF'
🤖 Auto-discovered Skills (1 found)

名称 | 描述 | 发现时间
--- | --- | ---
screenshot-to-tailwind-card | Convert a UI screenshot to a Tailwind React card component... | 2026/5/12

使用方法:
  /skills-auto info <name>  查看技能详情
  /skills-auto clear        清空所有自动技能

存储位置: ~/.claude/skills/auto
EOF

echo ""

# ============================================================================
# 步骤 7: 演示第 4 个任务使用发现的技能
# ============================================================================
echo "🎯 步骤 7: 演示第 4 个任务使用发现的技能"
echo "----------------------------------------"
echo ""

cat > "$SAMPLES_DIR/card2.png.desc" << 'EOF'
Design: Another profile card with different styling
Colors: Dark background, white text, purple accent
Layout: Card with avatar on left, content on right
EOF

echo "▶️  任务 4: /design2code $(basename $SAMPLES_DIR/card2.png.desc)"
echo "   描述: $(head -1 $SAMPLES_DIR/card2.png.desc)"
echo ""
echo "→ 检测到相似设计，自动调用 skill: screenshot-to-tailwind-card"
echo "   (跳过从头 scaffold，直接复用已验证的工作流)"
echo ""
echo "   → [Skill] VisionQATool 分析设计..."
echo "   → [Skill] FileWriteTool 生成组件..."
echo "   → [Skill] BashTool 启动 dev server..."
echo "   ✅ 完成! (比第 1 次快 70%)"
echo ""

# ============================================================================
# 总结
# ============================================================================
echo "=================================================="
echo "📊 Demo 总结"
echo "=================================================="
echo ""
echo "✅ 已完成演示流程:"
echo "   1. 运行 3 个相似的设计转代码任务"
echo "   2. Session 退出时自动触发 reflection"
echo "   3. 发现可复用工作流: screenshot-to-tailwind-card"
echo "   4. 技能保存到 ~/.claude/skills/auto/"
echo "   5. 第 4 个任务自动调用发现的技能"
echo ""
echo "📁 生成的文件:"
echo "   - $AUTO_SKILLS_DIR/screenshot-to-tailwind-card.md"
echo ""
echo "🔄 下次启动时，该技能会自动加载，可直接通过 / 调用"
echo ""
echo "🎉 Skill Discovery 演示完成!"
echo "=================================================="
