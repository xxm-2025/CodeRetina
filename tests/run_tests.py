#!/usr/bin/env python3
"""
Claude Code Vision - 测试运行器

运行 Sprint 0-2 的所有测试
"""

import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Tuple


class TestRunner:
    """测试运行器"""

    def __init__(self, project_root: Path):
        self.project_root = project_root
        self.results: Dict[str, Tuple[int, int, str]] = {}

    def run_python_test(self, name: str, path: Path) -> None:
        """运行 Python 测试"""
        print(f"\n{'=' * 60}")
        print(f"运行: {name}")
        print('=' * 60)

        try:
            result = subprocess.run(
                [sys.executable, str(path)],
                capture_output=True,
                text=True,
                cwd=self.project_root,
                timeout=60,
            )

            print(result.stdout)
            if result.stderr:
                print("STDERR:", result.stderr)

            # 解析结果
            passed = result.stdout.count("✅")
            failed = result.stdout.count("❌")

            self.results[name] = (passed, failed, "PASS" if result.returncode == 0 else "FAIL")

        except subprocess.TimeoutExpired:
            print(f"❌ 测试超时")
            self.results[name] = (0, 1, "TIMEOUT")
        except Exception as e:
            print(f"❌ 测试运行失败: {e}")
            self.results[name] = (0, 1, "ERROR")

    def run_ts_test(self, name: str, path: Path) -> None:
        """运行 TypeScript 测试（使用 bun/node）"""
        print(f"\n{'=' * 60}")
        print(f"运行: {name}")
        print('=' * 60)

        # 检查可用的运行时
        ts_runner = None
        for runner in ["bun", "npx tsx", "npx ts-node"]:
            try:
                subprocess.run(runner.split(), capture_output=True, timeout=1)
                ts_runner = runner
                break
            except:
                continue

        if not ts_runner:
            print("⚠️  未找到 TypeScript 运行时 (bun/tsx/ts-node)，跳过此测试")
            self.results[name] = (0, 0, "SKIPPED")
            return

        try:
            cmd = ts_runner.split() + [str(path)]
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                cwd=self.project_root,
                timeout=60,
            )

            print(result.stdout)
            if result.stderr:
                print("STDERR:", result.stderr)

            passed = result.stdout.count("✅")
            failed = result.stdout.count("❌")

            self.results[name] = (passed, failed, "PASS" if result.returncode == 0 else "FAIL")

        except subprocess.TimeoutExpired:
            print(f"❌ 测试超时")
            self.results[name] = (0, 1, "TIMEOUT")
        except Exception as e:
            print(f"❌ 测试运行失败: {e}")
            self.results[name] = (0, 1, "ERROR")

    def print_summary(self) -> None:
        """打印测试摘要"""
        print("\n" + "=" * 60)
        print("测试摘要")
        print("=" * 60)

        total_passed = 0
        total_failed = 0

        for name, (passed, failed, status) in self.results.items():
            icon = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⚠️"
            print(f"{icon} {name}: {passed} 通过, {failed} 失败 [{status}]")
            total_passed += passed
            total_failed += failed

        print("-" * 60)
        total = total_passed + total_failed
        if total > 0:
            percentage = (total_passed / total) * 100
            print(f"总计: {total_passed}/{total} 通过 ({percentage:.1f}%)")

        if total_failed > 0:
            sys.exit(1)


def main():
    """主函数"""
    project_root = Path(__file__).parent.parent
    tests_dir = Path(__file__).parent

    runner = TestRunner(project_root)

    print("=" * 60)
    print("Claude Code Vision - Sprint 0-2 测试套件")
    print("=" * 60)

    # Sprint 0 测试
    print("\n" + "📦" * 20)
    print("Sprint 0: 基础架构")
    print("📦" * 20)

    runner.run_ts_test(
        "S0-3: Sidecar Protocol",
        tests_dir / "sprint0" / "sidecar_protocol.test.ts"
    )

    runner.run_ts_test(
        "S0-4: Entry Point",
        tests_dir / "sprint0" / "entry.test.ts"
    )

    # Sprint 1 测试
    print("\n" + "📦" * 20)
    print("Sprint 1: 视觉中台 + 工具家族（前半）")
    print("📦" * 20)

    runner.run_ts_test(
        "S1-1: Vision Sidecar",
        tests_dir / "sprint1" / "sidecar.test.ts"
    )

    runner.run_python_test(
        "S1-2/1-3: Python Sidecar VLM/Detect",
        tests_dir / "sprint1" / "python_sidecar_test.py"
    )

    runner.run_ts_test(
        "S1-4: Hybrid Vision Router",
        tests_dir / "sprint1" / "router.test.ts"
    )

    runner.run_ts_test(
        "S1-5: Vision Tools (QA/OCR/Annotate)",
        tests_dir / "sprint1" / "vision_tools.test.ts"
    )

    # Sprint 2 测试
    print("\n" + "📦" * 20)
    print("Sprint 2: 工具家族（后半）+ Screenshot-Driven Dev")
    print("📦" * 20)

    runner.run_ts_test(
        "S2-1: ScreenshotTool",
        tests_dir / "sprint2" / "screenshot_tool.test.ts"
    )

    runner.run_ts_test(
        "S2-2: BrowserVisionTool",
        tests_dir / "sprint2" / "browser_vision_tool.test.ts"
    )

    runner.run_ts_test(
        "S2-3: ImageDiffTool",
        tests_dir / "sprint2" / "image_diff_tool.test.ts"
    )

    # 打印摘要
    runner.print_summary()


if __name__ == "__main__":
    main()
