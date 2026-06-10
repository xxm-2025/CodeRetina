"""
GUI Agent —— 带规划能力的 GUI 自动化

两种模式:
1. Reactive: screenshot → act → execute (传统)
2. Deliberative: screenshot → propose → predict → judge → select → execute (规划)

Sprint: S7-D3
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any

from PIL import Image

from .gui import GUIExecutor
from .gui_planner.planner import PlannerLayer, PlanningStep

logger = logging.getLogger(__name__)


class GUIAgent:
    """
    GUI Agent with Planning Capability

    支持 reactive 和 deliberative 两种执行模式。
    """

    def __init__(
        self,
        planning_mode: bool = False,
        k: int = 3,
        max_steps: int = 10,
        save_plans_to: str | None = None,
    ):
        self.planning_mode = planning_mode
        self.k = k
        self.max_steps = max_steps
        self.save_plans_to = save_plans_to or f"~/.claude/gui_plans/agent_{int(time.time())}"

        # 执行器 (reactive 模式或 deliberative 模式的最后执行)
        self.executor = GUIExecutor()

        # 规划层 (仅 deliberative 模式使用)
        self.planner: PlannerLayer | None = None
        if planning_mode:
            self.planner = PlannerLayer(k=k, save_tree_to=self.save_plans_to)

        # 执行历史
        self.execution_history: list[dict[str, Any]] = []
        self.step_count = 0

    async def execute_task(
        self,
        task: str,
        planning_mode: bool | None = None,
    ) -> dict[str, Any]:
        """
        执行任务

        Args:
            task: 任务描述
            planning_mode: 是否使用规划模式（默认 self.planning_mode）

        Returns:
            执行结果
        """
        use_planning = planning_mode if planning_mode is not None else self.planning_mode

        logger.info(f"[execute_task] task={task[:50]}..., planning_mode={use_planning}")

        if use_planning and self.planner:
            return await self._execute_deliberative(task)
        else:
            return await self._execute_reactive(task)

    async def _execute_reactive(self, task: str) -> dict[str, Any]:
        """
        Reactive 模式执行

        传统循环: screenshot → predict action → execute
        """
        logger.info("[reactive] Starting reactive execution")

        actions_log: list[dict[str, Any]] = []

        for step in range(self.max_steps):
            logger.info(f"[reactive] Step {step + 1}/{self.max_steps}")

            # 1. 截图
            screenshot = await self._take_screenshot()
            screenshot_path = f"/tmp/gui_reactive_step_{step}.png"
            screenshot.save(screenshot_path)

            # 2. 预测动作 (直接，无多候选)
            prediction = await self._predict_action(screenshot, task)

            # 3. 执行
            result = await self._execute_action(prediction)

            # 4. 记录
            actions_log.append({
                "step": step,
                "mode": "reactive",
                "action": prediction,
                "result": result,
                "screenshot": screenshot_path,
            })

            self.step_count += 1

            # 5. 检查完成
            if prediction.get("action") == "done":
                logger.info("[reactive] Task completed")
                break

            # 6. 等待
            await self._wait(500)

        return {
            "success": True,
            "task": task,
            "mode": "reactive",
            "steps": len(actions_log),
            "actions": actions_log,
        }

    async def _execute_deliberative(self, task: str) -> dict[str, Any]:
        """
        Deliberative 模式执行

        规划循环: screenshot → propose(k) → predict(k) → judge → select → execute
        """
        logger.info("[deliberative] Starting deliberative execution with planning")

        actions_log: list[dict[str, Any]] = []
        planning_steps: list[PlanningStep] = []

        for step in range(self.max_steps):
            logger.info(f"[deliberative] Step {step + 1}/{self.max_steps}")

            # 1. 截图
            screenshot = await self._take_screenshot()
            screenshot_path = f"/tmp/gui_deliberative_step_{step}.png"
            screenshot.save(screenshot_path)

            # 2. 规划 (propose → predict → judge)
            if self.planner is None:
                raise RuntimeError("Planner not initialized")

            selected_candidate, planning_step = await self.planner.plan(
                screenshot_path=screenshot_path,
                task=task,
                max_steps=self.max_steps,
            )

            planning_steps.append(planning_step)

            logger.info(
                f"[deliberative] Selected action {selected_candidate.id}: "
                f"{selected_candidate.action_type} (score: {selected_candidate.reward_score:.2f})"
            )

            # 3. 转换 planner action 到 executor action 格式
            executor_action = self._convert_to_executor_action(selected_candidate)

            # 4. 执行
            result = await self._execute_action(executor_action)

            # 5. 记录
            actions_log.append({
                "step": step,
                "mode": "deliberative",
                "action": executor_action,
                "candidates_considered": [c.to_dict() for c in planning_step.candidates],
                "selected_candidate_id": selected_candidate.id,
                "predicted_state": selected_candidate.predicted_state,
                "result": result,
                "screenshot": screenshot_path,
                "planning_latency_ms": planning_step.latency_ms,
            })

            self.step_count += 1

            # 6. 检查完成
            if executor_action.get("action") == "done":
                logger.info("[deliberative] Task completed")
                break

            # 7. 等待
            await self._wait(500)

        # 保存完整执行记录
        self._save_execution_log(actions_log, planning_steps)

        return {
            "success": True,
            "task": task,
            "mode": "deliberative",
            "steps": len(actions_log),
            "actions": actions_log,
            "planning_stats": self.planner.get_stats() if self.planner else {},
            "save_path": self.save_plans_to,
        }

    def _convert_to_executor_action(self, candidate: Any) -> dict[str, Any]:
        """将 planner 的候选动作转换为 executor 的动作格式"""
        return {
            "action": candidate.action_type,
            "params": candidate.params,
            "reasoning": candidate.rationale,
        }

    async def _predict_action(self, screenshot: Image.Image, task: str) -> dict[str, Any]:
        """预测下一步动作 (reactive 模式)"""
        # 使用 executor 的 mock 预测
        return await self.executor._mock_predict(task, self.step_count)

    async def _take_screenshot(self) -> Image.Image:
        """截图"""
        return await self.executor._take_screenshot()

    async def _execute_action(self, action: dict[str, Any]) -> str:
        """执行动作"""
        return await self.executor._execute_action(action)

    async def _wait(self, ms: int) -> None:
        """等待"""
        await self.executor._wait(ms)

    def _save_execution_log(
        self,
        actions_log: list[dict[str, Any]],
        planning_steps: list[PlanningStep],
    ) -> None:
        """保存执行记录"""
        import json

        save_path = Path(self.save_plans_to).expanduser()
        save_path.mkdir(parents=True, exist_ok=True)

        # 执行日志
        log_file = save_path / "execution_log.json"
        log_data = {
            "task": self.execution_history,
            "mode": "deliberative" if self.planning_mode else "reactive",
            "total_steps": len(actions_log),
            "actions": actions_log,
        }
        log_file.write_text(json.dumps(log_data, indent=2, ensure_ascii=False))

        logger.info(f"[save] Execution log saved to {log_file}")


# ============================================================================
# RPC 方法
# ============================================================================

async def execute_with_planning(
    task: str,
    planning_mode: bool = True,
    k: int = 3,
    max_steps: int = 10,
    save_to: str | None = None,
) -> dict[str, Any]:
    """
    执行 GUI 任务（带规划）

    Args:
        task: 任务描述
        planning_mode: 是否启用规划模式
        k: 候选动作数量
        max_steps: 最大步数
        save_to: 保存路径

    Returns:
        执行结果
    """
    agent = GUIAgent(
        planning_mode=planning_mode,
        k=k,
        max_steps=max_steps,
        save_plans_to=save_to,
    )

    return await agent.execute_task(task)


async def compare_modes(
    task: str,
    k: int = 3,
    max_steps: int = 10,
) -> dict[str, Any]:
    """
    对比 reactive 和 deliberative 两种模式

    执行相同任务两次，分别使用两种模式，对比结果。

    Returns:
        {
            "reactive": {...},
            "deliberative": {...},
            "comparison": {...},
        }
    """
    logger.info(f"[compare_modes] Task: {task}")

    # 1. Reactive 执行
    agent_reactive = GUIAgent(planning_mode=False, max_steps=max_steps)
    result_reactive = await agent_reactive.execute_task(task, planning_mode=False)

    # 2. Deliberative 执行
    agent_delib = GUIAgent(planning_mode=True, k=k, max_steps=max_steps)
    result_delib = await agent_delib.execute_task(task, planning_mode=True)

    # 3. 对比分析
    comparison = {
        "reactive_steps": result_reactive.get("steps", 0),
        "deliberative_steps": result_delib.get("steps", 0),
        "step_difference": result_delib.get("steps", 0) - result_reactive.get("steps", 0),
        "reactive_success": result_reactive.get("success", False),
        "deliberative_success": result_delib.get("success", False),
        "planning_overhead_ms": result_delib.get("planning_stats", {}).get("total_planning_time_ms", 0),
    }

    return {
        "task": task,
        "reactive": result_reactive,
        "deliberative": result_delib,
        "comparison": comparison,
    }
