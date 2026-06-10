#!/bin/bash
#
# Sprint 7 — 方向 D (Visual Planning / World Model) Demo 脚本
#
# 演示:
# 1. GUI Planner propose/predict/judge 流程
# 2. Reactive vs Deliberative 模式对比
# 3. 规划树可视化
#

set -e

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║     Sprint 7 — 方向 D: Visual Planning / World Model          ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# 检查 Python 环境
echo "📋 检查 Python 环境..."
cd "$(dirname "$0")/../vision_sidecar"
python3 -c "
import sys
sys.path.insert(0, '.')
from vision_sidecar.methods import gui_agent
from vision_sidecar.methods.gui_planner import planner
print('✓ gui_agent module import OK')
print('✓ gui_planner module import OK')
"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 1: PlannerLayer 单步规划 (propose → predict → judge)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

python3 << 'EOF'
import asyncio
import sys
sys.path.insert(0, '.')

from vision_sidecar.methods.gui_planner.planner import PlannerLayer

async def test_planner():
    planner = PlannerLayer(k=3, save_tree_to="test_output/gui_plans/test_plan")
    
    # 模拟截图路径
    screenshot = "test_output/mock_screen.png"
    
    # 创建模拟截图
    from PIL import Image, ImageDraw, ImageFont
    img = Image.new('RGB', (800, 600), color='#2d3748')
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 20)
    except:
        font = ImageFont.load_default()
    draw.text((50, 50), "Mock Application Window", fill='white', font=font)
    draw.rectangle([100, 200, 200, 250], fill='#4a5568')  # Settings button
    draw.text((110, 215), "Settings", fill='white', font=font)
    img.save(screenshot)
    
    # 执行规划
    task = "Open Settings and change the theme"
    selected, step = await planner.plan(screenshot, task, max_steps=5)
    
    print(f"规划完成:")
    print(f"  步骤: {step.step}")
    print(f"  候选数: {len(step.candidates)}")
    print(f"  选中: {selected.id} ({selected.action_type})")
    print(f"  理由: {selected.rationale}")
    print(f"  预测状态: {selected.predicted_state[:60]}...")
    print(f"  置信度: {selected.confidence:.2f}")
    print(f"  评分: {selected.reward_score:.2f}")
    print(f"  延迟: {step.latency_ms}ms")
    print(f"  保存路径: {planner.save_tree_to}")
    
    # 打印所有候选
    print(f"\n所有候选:")
    for c in step.candidates:
        mark = "⭐" if c.id == selected.id else "  "
        print(f"  {mark} {c.id}: {c.action_type} (score: {c.reward_score:.2f})")

asyncio.run(test_planner())
EOF

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 2: Reactive 模式执行"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

python3 << 'EOF'
import asyncio
import sys
sys.path.insert(0, '.')

from vision_sidecar.methods.gui_agent import GUIAgent

async def test_reactive():
    agent = GUIAgent(planning_mode=False, max_steps=3)
    
    result = await agent.execute_task("Open settings menu")
    
    print(f"Reactive 模式结果:")
    print(f"  成功: {result['success']}")
    print(f"  步数: {result['steps']}")
    print(f"  模式: {result['mode']}")
    print(f"\n执行记录:")
    for a in result['actions'][:3]:
        print(f"  Step {a['step']}: {a['action']['action']} - {a['result'][:40]}...")

asyncio.run(test_reactive())
EOF

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 3: Deliberative 模式执行 (带规划)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

python3 << 'EOF'
import asyncio
import sys
sys.path.insert(0, '.')

from vision_sidecar.methods.gui_agent import GUIAgent

async def test_deliberative():
    agent = GUIAgent(
        planning_mode=True,
        k=3,
        max_steps=3,
        save_plans_to="test_output/gui_plans/deliberative_test"
    )
    
    result = await agent.execute_task("Open settings menu", planning_mode=True)
    
    print(f"Deliberative 模式结果:")
    print(f"  成功: {result['success']}")
    print(f"  步数: {result['steps']}")
    print(f"  模式: {result['mode']}")
    print(f"  保存路径: {result.get('save_path', 'N/A')}")
    
    stats = result.get('planning_stats', {})
    print(f"\n规划统计:")
    print(f"  总步数: {stats.get('total_steps', 0)}")
    print(f"  平均延迟: {stats.get('avg_step_latency_ms', 0):.0f}ms")
    print(f"  总规划时间: {stats.get('total_planning_time_ms', 0)}ms")
    
    print(f"\n执行记录:")
    for a in result['actions'][:3]:
        print(f"  Step {a['step']}: {a['action']['action']} "
              f"(candidates: {len(a.get('candidates_considered', []))}, "
              f"selected: {a.get('selected_candidate_id', 'N/A')})")

asyncio.run(test_deliberative())
EOF

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 4: Reactive vs Deliberative 对比"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

python3 << 'EOF'
import asyncio
import sys
sys.path.insert(0, '.')

from vision_sidecar.methods.gui_agent import compare_modes

async def test_comparison():
    result = await compare_modes(
        task="Navigate to advanced settings",
        k=3,
        max_steps=5,
    )
    
    print(f"模式对比结果:")
    print(f"  任务: {result['task']}")
    print(f"\n  Reactive:")
    print(f"    - 步数: {result['comparison']['reactive_steps']}")
    print(f"    - 成功: {result['comparison']['reactive_success']}")
    print(f"\n  Deliberative:")
    print(f"    - 步数: {result['comparison']['deliberative_steps']}")
    print(f"    - 成功: {result['comparison']['deliberative_success']}")
    print(f"    - 规划开销: {result['comparison']['planning_overhead_ms']}ms")
    print(f"\n  对比:")
    diff = result['comparison']['step_difference']
    if diff < 0:
        print(f"    ✅ Deliberative 节省 {abs(diff)} 步 ({abs(diff)/result['comparison']['reactive_steps']*100:.0f}%)")
    elif diff > 0:
        print(f"    ⚠️  Deliberative 多 {diff} 步")
    else:
        print(f"    ➡️  步数相同")

asyncio.run(test_comparison())
EOF

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 5: 规划树列表"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

python3 << 'EOF'
import asyncio
import sys
sys.path.insert(0, '.')

from vision_sidecar.methods.gui_planner.planner import list_plan_sessions

async def test_list_sessions():
    sessions = list_plan_sessions("test_output/gui_plans")
    
    print(f"规划会话列表:")
    print(f"  总数: {len(sessions)}")
    print("")
    
    for s in sessions[:5]:
        print(f"  - {s['session_id']}: {s['total_steps']} steps (K={s['k']})")

asyncio.run(test_list_sessions())
EOF

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                       Demo 完成!                                  ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "实现的功能:"
echo "  ✓ propose.md / predict.md / judge.md - 规划 Prompt 模板"
echo "  ✓ CandidateAction - 候选动作数据结构"
echo "  ✓ PlanningStep - 规划步骤记录"
echo "  ✓ PlannerLayer - 规划层 (propose → predict → judge)"
echo "  ✓ PlannerLayer.plan() - 完整规划循环"
echo "  ✓ 规划树 JSON 序列化与保存"
echo "  ✓ GUIAgent - 支持 reactive/deliberative 双模式"
echo "  ✓ GUIAgent._execute_deliberative() - 规划执行"
echo "  ✓ compare_modes() - 模式对比"
echo "  ✓ /gui-plan-show 命令 - 规划树可视化"
echo ""
echo "CLI 命令示例:"
echo "  ./coderetina /gui \"open settings\"              # reactive 模式"
echo "  ./coderetina /gui \"open settings\" --planning   # deliberative 模式"
echo "  ./coderetina /gui-plan-show --list               # 列出规划记录"
echo "  ./coderetina /gui-plan-show plan_xxx             # 查看规划树"
echo ""
