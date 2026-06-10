"""
GUI Planner Layer —— Deliberative Planning for GUI Agents

实现 WebDreamer/SeeAct 风格的规划：
- propose → predict → judge → select → execute

区别于 reactive 模式：
- Reactive: screenshot → act → execute (单步)
- Deliberative: screenshot → propose(k) → predict(k) → judge → select → execute

Sprint: S7-D2
"""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any

from PIL import Image

logger = logging.getLogger(__name__)

# 是否使用真实 LLM
USE_REAL_LLM = False

# Prompt 目录
PROMPT_DIR = Path(__file__).parent / "prompts"


class CandidateAction:
    """候选动作"""

    def __init__(
        self,
        id: str,
        action_type: str,
        params: dict[str, Any],
        rationale: str,
    ):
        self.id = id
        self.action_type = action_type
        self.params = params
        self.rationale = rationale
        self.predicted_state: str = ""
        self.predicted_changes: list[str] = []
        self.confidence: float = 0.0
        self.reward_score: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "action": {"type": self.action_type, "params": self.params},
            "rationale": self.rationale,
            "predicted_state": self.predicted_state,
            "predicted_changes": self.predicted_changes,
            "confidence": self.confidence,
            "reward_score": self.reward_score,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "CandidateAction":
        action = data.get("action", {})
        cand = cls(
            id=data["id"],
            action_type=action.get("type", "unknown"),
            params=action.get("params", {}),
            rationale=data.get("rationale", ""),
        )
        cand.predicted_state = data.get("predicted_state", "")
        cand.predicted_changes = data.get("predicted_changes", [])
        cand.confidence = data.get("confidence", 0.0)
        cand.reward_score = data.get("reward_score", 0.0)
        return cand


class PlanningStep:
    """规划步骤"""

    def __init__(
        self,
        step: int,
        screenshot_path: str,
        task: str,
        candidates: list[CandidateAction],
        selected_id: str | None = None,
    ):
        self.step = step
        self.screenshot_path = screenshot_path
        self.task = task
        self.candidates = candidates
        self.selected_id = selected_id
        self.timestamp = time.time()
        self.latency_ms = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "step": self.step,
            "timestamp": self.timestamp,
            "screenshot_path": self.screenshot_path,
            "task": self.task,
            "candidates": [c.to_dict() for c in self.candidates],
            "selected_id": self.selected_id,
            "latency_ms": self.latency_ms,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "PlanningStep":
        step = cls(
            step=data["step"],
            screenshot_path=data["screenshot_path"],
            task=data["task"],
            candidates=[CandidateAction.from_dict(c) for c in data.get("candidates", [])],
            selected_id=data.get("selected_id"),
        )
        step.timestamp = data.get("timestamp", time.time())
        step.latency_ms = data.get("latency_ms", 0)
        return step


class PlannerLayer:
    """
    GUI 规划层

    实现 propose → predict → judge → select 循环
    """

    def __init__(
        self,
        k: int = 3,
        save_tree_to: str | None = None,
    ):
        self.k = k  # 候选数量
        self.save_tree_to = save_tree_to or f"~/.claude/gui_plans/plan_{int(time.time())}"
        self.history: list[PlanningStep] = []
        self.step_count = 0

    def _load_prompt(self, name: str) -> str:
        """加载 prompt 模板"""
        prompt_path = PROMPT_DIR / f"{name}.md"
        if prompt_path.exists():
            return prompt_path.read_text()
        return ""

    def _call_llm(self, prompt: str) -> str:
        """调用 LLM（Mock 或真实）"""
        if USE_REAL_LLM:
            # 真实实现：调用 Claude API
            # from . import vlm
            # result = await vlm.query(image_path, prompt)
            # return result.get("answer", "")
            pass

        # Mock 实现：返回模拟的 JSON
        return ""

    async def propose(
        self,
        screenshot_path: str,
        task: str,
    ) -> list[CandidateAction]:
        """
        提出 K 个候选动作

        Args:
            screenshot_path: 截图路径
            task: 任务描述

        Returns:
            K 个候选动作
        """
        logger.info(f"[propose] Step {self.step_count}, task={task[:50]}...")

        prompt_template = self._load_prompt("propose")
        prompt = prompt_template.format(k=self.k, task=task)

        if USE_REAL_LLM:
            # 真实 LLM 调用
            response = self._call_llm(prompt)
            try:
                data = json.loads(response)
                candidates = [
                    CandidateAction(
                        id=c["id"],
                        action_type=c["action"]["type"],
                        params=c["action"]["params"],
                        rationale=c["rationale"],
                    )
                    for c in data
                ]
                return candidates
            except Exception as e:
                logger.error(f"Failed to parse propose response: {e}")

        # Mock 实现：基于任务生成候选
        return self._mock_propose(task)

    def _mock_propose(self, task: str) -> list[CandidateAction]:
        """Mock 候选生成"""
        task_lower = task.lower()

        if "click" in task_lower or "button" in task_lower:
            return [
                CandidateAction("A", "click", {"x": 100, "y": 100}, "Click on main button"),
                CandidateAction("B", "click", {"x": 200, "y": 150}, "Click on alternative option"),
                CandidateAction("C", "hotkey", {"keys": ["enter"]}, "Use keyboard shortcut"),
            ]

        if "type" in task_lower or "input" in task_lower or "search" in task_lower:
            return [
                CandidateAction("A", "click", {"x": 300, "y": 200}, "Focus input field first"),
                CandidateAction("B", "type", {"text": "query"}, "Type search query directly"),
                CandidateAction("C", "hotkey", {"keys": ["cmd", "a"]}, "Select all existing text first"),
            ]

        if "scroll" in task_lower or "find" in task_lower:
            return [
                CandidateAction("A", "scroll", {"direction": "down", "amount": 5}, "Scroll down to see more"),
                CandidateAction("B", "hotkey", {"keys": ["cmd", "f"]}, "Open find dialog"),
                CandidateAction("C", "click", {"x": 500, "y": 400}, "Click on visible element"),
            ]

        # 通用候选
        return [
            CandidateAction("A", "click", {"x": 400, "y": 300}, "Click on center of screen"),
            CandidateAction("B", "wait", {"ms": 1000}, "Wait for UI to settle"),
            CandidateAction("C", "screenshot", {}, "Take another screenshot to reassess"),
        ]

    async def predict(
        self,
        screenshot_path: str,
        task: str,
        candidate: CandidateAction,
    ) -> None:
        """
        预测候选动作执行后的状态

        修改 candidate 的 predicted_state 和 predicted_changes
        """
        logger.info(f"[predict] Candidate {candidate.id}: {candidate.action_type}")

        prompt_template = self._load_prompt("predict")
        prompt = prompt_template.format(
            task=task,
            action_json=json.dumps(candidate.to_dict()["action"]),
            rationale=candidate.rationale,
        )

        if USE_REAL_LLM:
            response = self._call_llm(prompt)
            try:
                data = json.loads(response)
                candidate.predicted_state = data.get("predicted_state", "")
                candidate.predicted_changes = data.get("expected_changes", [])
                candidate.confidence = data.get("confidence", 0.5)
                return
            except Exception as e:
                logger.error(f"Failed to parse predict response: {e}")

        # Mock 预测
        candidate.predicted_state = self._mock_predict_state(candidate)
        candidate.predicted_changes = [f"After {candidate.action_type}, UI state changes"]
        candidate.confidence = 0.8

    def _mock_predict_state(self, candidate: CandidateAction) -> str:
        """Mock 状态预测"""
        action = candidate.action_type

        if action == "click":
            return f"Button at ({candidate.params.get('x', 0)}, {candidate.params.get('y', 0)}) is activated. New dialog or menu appears."

        if action == "type":
            text = candidate.params.get("text", "")
            return f"Input field now contains: '{text}'. Cursor is at end of text."

        if action == "scroll":
            direction = candidate.params.get("direction", "down")
            return f"Page scrolled {direction}. New content becomes visible."

        if action == "hotkey":
            keys = candidate.params.get("keys", [])
            return f"Keyboard shortcut {'+'.join(keys)} executed. Corresponding action performed."

        if action == "wait":
            return "UI remains stable. Any loading processes complete."

        return f"Action {action} executed. State updated accordingly."

    async def judge(
        self,
        task: str,
        candidates: list[CandidateAction],
        step: int,
        max_steps: int,
    ) -> str:
        """
        判断并选择最优候选

        Returns:
            选中的 candidate id
        """
        logger.info(f"[judge] Evaluating {len(candidates)} candidates")

        # 构建 candidates_text
        candidates_text = ""
        for c in candidates:
            candidates_text += f"\n### Candidate {c.id}\n"
            candidates_text += f"Action: {c.action_type} {c.params}\n"
            candidates_text += f"Rationale: {c.rationale}\n"
            candidates_text += f"Predicted state: {c.predicted_state[:100]}...\n"
            candidates_text += f"Confidence: {c.confidence}\n"

        prompt_template = self._load_prompt("judge")
        prompt = prompt_template.format(
            task=task,
            step=step,
            max_steps=max_steps,
            candidates_text=candidates_text,
        )

        if USE_REAL_LLM:
            response = self._call_llm(prompt)
            try:
                data = json.loads(response)
                best_id = data.get("best_id")
                # 更新 reward scores
                for rank in data.get("ranking", []):
                    for c in candidates:
                        if c.id == rank["id"]:
                            c.reward_score = rank.get("score", 0.0)
                return best_id
            except Exception as e:
                logger.error(f"Failed to parse judge response: {e}")

        # Mock 判断：选择第一个，或基于启发式
        return self._mock_judge(candidates)

    def _mock_judge(self, candidates: list[CandidateAction]) -> str:
        """Mock 判断逻辑"""
        # 简单的启发式：偏好 click 和 type，避免 wait
        for c in candidates:
            if c.action_type in ["click", "type"]:
                c.reward_score = 0.9
            elif c.action_type == "hotkey":
                c.reward_score = 0.8
            else:
                c.reward_score = 0.5

        # 选择最高分
        best = max(candidates, key=lambda x: x.reward_score)
        logger.info(f"[judge] Selected candidate {best.id} with score {best.reward_score}")
        return best.id

    async def plan(
        self,
        screenshot_path: str,
        task: str,
        max_steps: int = 10,
    ) -> tuple[CandidateAction, PlanningStep]:
        """
        完整规划循环

        Returns:
            (选中的候选动作, 规划步骤记录)
        """
        start_time = time.time()

        # 1. Propose
        candidates = await self.propose(screenshot_path, task)

        # 2. Predict (for each candidate)
        for c in candidates:
            await self.predict(screenshot_path, task, c)

        # 3. Judge
        selected_id = await self.judge(task, candidates, self.step_count, max_steps)

        # 4. 创建步骤记录
        step = PlanningStep(
            step=self.step_count,
            screenshot_path=screenshot_path,
            task=task,
            candidates=candidates,
            selected_id=selected_id,
        )
        step.latency_ms = int((time.time() - start_time) * 1000)

        self.history.append(step)
        self.step_count += 1

        # 5. 保存规划树
        self._save_plan_tree()

        # 返回选中的候选
        selected = next((c for c in candidates if c.id == selected_id), candidates[0])
        return selected, step

    def _save_plan_tree(self) -> None:
        """保存规划树到文件"""
        save_path = Path(self.save_tree_to).expanduser()
        save_path.mkdir(parents=True, exist_ok=True)

        # 保存整体规划树
        tree_file = save_path / "plan_tree.json"
        tree_data = {
            "session_id": Path(self.save_tree_to).name,
            "total_steps": len(self.history),
            "k": self.k,
            "steps": [s.to_dict() for s in self.history],
        }
        tree_file.write_text(json.dumps(tree_data, indent=2, ensure_ascii=False))

        # 保存每一步的详细数据
        for step in self.history:
            step_file = save_path / f"step{step.step:03d}.json"
            step_file.write_text(json.dumps(step.to_dict(), indent=2, ensure_ascii=False))

        logger.info(f"[save] Plan tree saved to {save_path}")

    def get_stats(self) -> dict[str, Any]:
        """获取规划统计"""
        if not self.history:
            return {"total_steps": 0}

        total_latency = sum(s.latency_ms for s in self.history)
        avg_latency = total_latency / len(self.history)

        return {
            "total_steps": len(self.history),
            "avg_step_latency_ms": avg_latency,
            "total_planning_time_ms": total_latency,
            "save_location": self.save_tree_to,
        }


# ============================================================================
# 便捷函数
# ============================================================================

async def plan_single_step(
    screenshot_path: str,
    task: str,
    k: int = 3,
    save_tree_to: str | None = None,
) -> dict[str, Any]:
    """
    单步规划（便捷函数）

    Returns:
        {
            "selected_action": {...},
            "candidates": [...],
            "latency_ms": int,
        }
    """
    planner = PlannerLayer(k=k, save_tree_to=save_tree_to)
    selected, step = await planner.plan(screenshot_path, task)

    return {
        "selected_action": selected.to_dict(),
        "candidates": [c.to_dict() for c in step.candidates],
        "step": step.step,
        "latency_ms": step.latency_ms,
        "save_path": planner.save_tree_to,
    }


def load_plan_tree(session_path: str) -> list[PlanningStep]:
    """加载规划树"""
    tree_file = Path(session_path).expanduser() / "plan_tree.json"
    if not tree_file.exists():
        return []

    data = json.loads(tree_file.read_text())
    return [PlanningStep.from_dict(s) for s in data.get("steps", [])]


def list_plan_sessions(base_dir: str = "~/.claude/gui_plans") -> list[dict[str, Any]]:
    """列出所有规划会话"""
    base = Path(base_dir).expanduser()
    if not base.exists():
        return []

    sessions = []
    for session_dir in base.iterdir():
        if session_dir.is_dir():
            tree_file = session_dir / "plan_tree.json"
            if tree_file.exists():
                try:
                    data = json.loads(tree_file.read_text())
                    sessions.append({
                        "session_id": session_dir.name,
                        "path": str(session_dir),
                        "total_steps": data.get("total_steps", 0),
                        "k": data.get("k", 3),
                        "created": session_dir.stat().st_mtime,
                    })
                except:
                    pass

    # 按时间排序（新的在前）
    sessions.sort(key=lambda x: x["created"], reverse=True)
    return sessions
