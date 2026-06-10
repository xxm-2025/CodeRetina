#!/usr/bin/env python3
"""
Agentic Visual Search 自测脚本

测试 5 个场景，对比 agentic on/off：
1. 小字识别 (small_text)
2. 密集UI (dense_ui)
3. 表格数据 (grid_data)
4. 图表分析 (chart)
5. 角落元素定位 (corner_elements)

Sprint: S5-A6
"""

import json
import subprocess
import sys
import time
from pathlib import Path

# 测试配置
TEST_CASES = [
    {
        "name": "小字错误码识别",
        "image": "test_data/agentic/small_text.png",
        "question": "What is the error code in the bottom-right toast?",
        "should_trigger_agentic": True,
    },
    {
        "name": "密集UI按钮计数",
        "image": "test_data/agentic/dense_ui.png",
        "question": "How many buttons are in the toolbar?",
        "should_trigger_agentic": True,
    },
    {
        "name": "表格单元格查找",
        "image": "test_data/agentic/grid_data.png",
        "question": "What is the Score of Item C?",
        "should_trigger_agentic": False,  # 表格不算太密集
    },
    {
        "name": "图表数值读取",
        "image": "test_data/agentic/chart.png",
        "question": "What is the value for May?",
        "should_trigger_agentic": False,
    },
    {
        "name": "角落元素定位",
        "image": "test_data/agentic/corner_elements.png",
        "question": "What is the label in the bottom-right corner?",
        "should_trigger_agentic": True,
    },
]


def run_sidecar_test(image_path: str, question: str, agentic: bool = False) -> dict:
    """
    通过 sidecar 直接测试 vlm.agentic_qa

    返回结果字典
    """
    import asyncio
    import sys
    sys.path.insert(0, 'vision_sidecar')

    from vision_sidecar.methods import vlm_agentic

    async def test():
        result = await vlm_agentic.agentic_qa(
            image_path=image_path,
            prompt=question,
            max_steps=5,
            base_model="moondream2",
        )
        return result

    return asyncio.run(test())


def run_comparison(test_case: dict) -> dict:
    """
    对比测试：agentic on vs off
    """
    print(f"\n{'='*60}")
    print(f"测试: {test_case['name']}")
    print(f"问题: {test_case['question']}")
    print(f"{'='*60}")

    image_path = test_case['image']
    question = test_case['question']

    # 检查图像存在
    if not Path(image_path).exists():
        print(f"❌ 图像不存在: {image_path}")
        return None

    results = {}

    # 测试 1: Agentic OFF (普通 query)
    print("\n📍 测试 1: 普通模式 (agentic=false)")
    start = time.time()
    try:
        # 使用普通 vlm.query (mock 模式)
        import asyncio
        sys.path.insert(0, 'vision_sidecar')
        from vision_sidecar.methods import vlm

        async def normal_query():
            return await vlm.query(image_path, question)

        normal_result = asyncio.run(normal_query())
        results['normal'] = {
            'answer': normal_result.get('answer', 'N/A'),
            'confidence': normal_result.get('confidence', 0),
            'latency_ms': int((time.time() - start) * 1000),
            'success': True,
        }
        print(f"   回答: {results['normal']['answer'][:50]}")
        print(f"   置信度: {results['normal']['confidence']:.2f}")
    except Exception as e:
        results['normal'] = {'error': str(e), 'success': False}
        print(f"   ❌ 错误: {e}")

    # 测试 2: Agentic ON
    print("\n📍 测试 2: Agentic 模式 (agentic=true)")
    start = time.time()
    try:
        agentic_result = run_sidecar_test(image_path, question, agentic=True)
        results['agentic'] = {
            'answer': agentic_result.get('answer', 'N/A'),
            'confidence': agentic_result.get('confidence', 0),
            'steps': len(agentic_result.get('steps', [])),
            'latency_ms': agentic_result.get('total_latency_ms', 0),
            'success': True,
            'trace_dir': agentic_result.get('trace_dir'),
        }
        print(f"   回答: {results['agentic']['answer'][:50]}")
        print(f"   置信度: {results['agentic']['confidence']:.2f}")
        print(f"   步数: {results['agentic']['steps']}")
        print(f"   Trace: {results['agentic'].get('trace_dir', 'N/A')}")
    except Exception as e:
        results['agentic'] = {'error': str(e), 'success': False}
        print(f"   ❌ 错误: {e}")

    # 对比分析
    if results['normal'].get('success') and results['agentic'].get('success'):
        confidence_diff = results['agentic']['confidence'] - results['normal']['confidence']
        print(f"\n📊 对比结果:")
        print(f"   置信度差值: {confidence_diff:+.2f} ({confidence_diff*100:+.0f}%)")
        if confidence_diff > 0.1:
            print("   ✅ Agentic 模式置信度显著提升")
        elif confidence_diff < -0.1:
            print("   ⚠️  Agentic 模式置信度下降")
        else:
            print("   ➡️  两者置信度相近")

    return results


def generate_report(all_results: list) -> str:
    """生成测试报告"""
    lines = []
    lines.append("\n" + "="*70)
    lines.append("         Agentic Visual Search — 自测报告")
    lines.append("="*70)
    lines.append("")

    total_cases = len(all_results)
    success_cases = sum(1 for r in all_results if r and r.get('agentic', {}).get('success'))

    lines.append(f"总测试数: {total_cases}")
    lines.append(f"成功数: {success_cases}")
    lines.append(f"成功率: {success_cases/total_cases*100:.0f}%")
    lines.append("")

    # 详细结果表
    lines.append("-"*70)
    lines.append(f"{'测试项':<20} {'普通置信度':<12} {'Agentic置信度':<14} {'提升':<10}")
    lines.append("-"*70)

    for i, result in enumerate(all_results):
        if not result:
            continue
        case = TEST_CASES[i]
        normal_conf = result.get('normal', {}).get('confidence', 0) * 100
        agentic_conf = result.get('agentic', {}).get('confidence', 0) * 100
        improvement = agentic_conf - normal_conf

        lines.append(
            f"{case['name']:<18} {normal_conf:>5.1f}%       {agentic_conf:>5.1f}%         {improvement:>+5.1f}%"
        )

    lines.append("-"*70)
    lines.append("")

    return "\n".join(lines)


def main():
    """主函数"""
    print("╔══════════════════════════════════════════════════════════════════╗")
    print("║     Agentic Visual Search — 方向 A 自测 (Sprint 5-A6)             ║")
    print("╚══════════════════════════════════════════════════════════════════╝")

    # 确保测试图像存在
    test_dir = Path("test_data/agentic")
    if not test_dir.exists():
        print("\n❌ 测试图像目录不存在，先生成测试图像...")
        subprocess.run([sys.executable, str(test_dir / "generate_test_images.py")], check=True)

    all_results = []
    for test_case in TEST_CASES:
        result = run_comparison(test_case)
        all_results.append(result)
        time.sleep(0.5)  # 避免过快

    # 生成报告
    report = generate_report(all_results)
    print(report)

    # 保存报告
    report_path = Path("test_data/agentic/test_report.txt")
    report_path.write_text(report)
    print(f"\n📄 报告已保存: {report_path}")

    print("\n✅ 自测完成")


if __name__ == "__main__":
    main()
