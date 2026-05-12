"""
GUI 操作 RPC 方法 —— UI-TARS 后端

基于 UI-TARS-1.5 模型的 GUI 自动化。

方法:
- gui.execute: 执行 GUI 任务
- gui.click: 点击坐标
- gui.type: 输入文字
- gui.screenshot: 屏幕截图

Sprint: S3-4
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any

from PIL import Image

logger = logging.getLogger(__name__)

# 是否使用真实模型
USE_REAL_MODELS = False  # 需要 UI-TARS 模型支持


class UITARSModel:
    """
    UI-TARS-1.5 模型包装

    字节跳动开源的 GUI 操作模型。
    """

    def __init__(self, model_path: str | None = None, device: str = "cpu"):
        self.model_path = model_path
        self.device = device
        self._model: Any = None
        self._tokenizer: Any = None
        self._loaded = False

    def load(self) -> None:
        """加载模型"""
        if self._loaded:
            return

        if not self.model_path:
            raise ValueError("UI-TARS 模型路径未指定")

        logger.info(f"Loading UI-TARS model from {self.model_path}")

        try:
            from transformers import AutoModel, AutoTokenizer

            self._tokenizer = AutoTokenizer.from_pretrained(
                self.model_path, trust_remote_code=True
            )
            self._model = AutoModel.from_pretrained(
                self.model_path,
                trust_remote_code=True,
                torch_dtype="auto",
                device_map={"": self.device},
            )
            self._model.eval()
            self._loaded = True

            logger.info("UI-TARS model loaded")

        except Exception as e:
            logger.error(f"Failed to load UI-TARS: {e}")
            raise

    def predict_action(
        self, screenshot: Image.Image, task: str, history: list[dict] | None = None
    ) -> dict[str, Any]:
        """
        预测下一步操作

        Returns:
            {
                "action": str,  # click, type, scroll, hotkey, wait, done
                "params": dict,
                "reasoning": str,
            }
        """
        if not self._loaded:
            self.load()

        # 构建 prompt
        prompt = self._build_prompt(task, history)

        # 模型推理
        # TODO: 实现真实的 UI-TARS 推理
        # 这里使用 mock 实现

        return {
            "action": "click",
            "params": {"x": 100, "y": 100},
            "reasoning": "Mock action for demonstration",
        }

    def _build_prompt(self, task: str, history: list[dict] | None = None) -> str:
        """构建对话 prompt"""
        prompt = f"Task: {task}\n\n"

        if history:
            prompt += "History:\n"
            for h in history:
                prompt += f"- {h['action']}: {h.get('result', 'N/A')}\n"
            prompt += "\n"

        prompt += "What is the next action?"
        return prompt


class GUIExecutor:
    """
    GUI 执行器

    整合模型推理和实际操作执行。
    """

    def __init__(self, model: UITARSModel | None = None):
        self.model = model
        self.history: list[dict] = []

    async def execute_task(
        self, task: str, max_steps: int = 10
    ) -> dict[str, Any]:
        """
        执行 GUI 任务

        Args:
            task: 任务描述
            max_steps: 最大步数

        Returns:
            执行结果
        """
        logger.info(f"Executing GUI task: {task}")

        actions_log: list[dict] = []
        screenshot_before: str | None = None

        for step in range(max_steps):
            logger.info(f"Step {step + 1}/{max_steps}")

            # 1. 截图
            screenshot = await self._take_screenshot()
            screenshot_before = f"/tmp/gui_step_{step}_before.png"
            screenshot.save(screenshot_before)

            # 2. 预测动作
            if self.model:
                prediction = self.model.predict_action(screenshot, task, self.history)
            else:
                # Mock 预测
                prediction = await self._mock_predict(task, step)

            logger.info(f"Predicted action: {prediction}")

            # 3. 执行动作
            action_result = await self._execute_action(prediction)

            # 4. 记录历史
            self.history.append({
                "step": step,
                "action": prediction,
                "result": action_result,
            })

            actions_log.append({
                "step": step,
                "action": prediction,
                "screenshot": screenshot_before,
                "result": action_result,
            })

            # 5. 检查是否完成
            if prediction.get("action") == "done":
                logger.info("Task completed")
                break

            # 6. 等待
            await self._wait(500)

        return {
            "success": True,
            "task": task,
            "steps": len(actions_log),
            "actions": actions_log,
            "final_screenshot": screenshot_before,
        }

    async def _take_screenshot(self) -> Image.Image:
        """截取屏幕"""
        try:
            # 使用 pyautogui
            import pyautogui

            return pyautogui.screenshot()
        except Exception as e:
            logger.warning(f"Screenshot failed: {e}")
            # 返回空白图
            return Image.new("RGB", (1280, 720), "gray")

    async def _execute_action(self, prediction: dict[str, Any]) -> str:
        """执行预测的动作"""
        action = prediction.get("action")
        params = prediction.get("params", {})

        if USE_REAL_MODELS:
            try:
                import pyautogui

                if action == "click":
                    x = params.get("x", 0)
                    y = params.get("y", 0)
                    pyautogui.click(x, y)
                    return f"Clicked at ({x}, {y})"

                elif action == "type":
                    text = params.get("text", "")
                    pyautogui.typewrite(text)
                    return f"Typed: {text}"

                elif action == "scroll":
                    direction = params.get("direction", "down")
                    amount = params.get("amount", 3)
                    pyautogui.scroll(-amount * 100 if direction == "down" else amount * 100)
                    return f"Scrolled {direction} by {amount}"

                elif action == "hotkey":
                    keys = params.get("keys", [])
                    pyautogui.hotkey(*keys)
                    return f"Pressed: {'+'.join(keys)}"

                elif action == "wait":
                    ms = params.get("ms", 1000)
                    time.sleep(ms / 1000)
                    return f"Waited {ms}ms"

                elif action == "done":
                    return "Task completed"

                else:
                    return f"Unknown action: {action}"

            except Exception as e:
                return f"Error executing {action}: {e}"
        else:
            # Mock 模式
            return f"[MOCK] Would execute: {action} with {params}"

    async def _mock_predict(self, task: str, step: int) -> dict[str, Any]:
        """Mock 预测（用于测试）"""
        mock_actions = [
            {"action": "click", "params": {"x": 100, "y": 100}, "reasoning": "Open application"},
            {"action": "wait", "params": {"ms": 1000}, "reasoning": "Wait for app to load"},
            {"action": "click", "params": {"x": 200, "y": 200}, "reasoning": "Click input field"},
            {"action": "type", "params": {"text": "Hello"}, "reasoning": "Enter text"},
            {"action": "done", "params": {}, "reasoning": "Task complete"},
        ]

        return mock_actions[min(step, len(mock_actions) - 1)]

    async def _wait(self, ms: int) -> None:
        """等待"""
        time.sleep(ms / 1000)


# 全局执行器
_executor: GUIExecutor | None = None


def get_executor() -> GUIExecutor:
    """获取全局执行器"""
    global _executor
    if _executor is None:
        if USE_REAL_MODELS:
            model = UITARSModel()
            _executor = GUIExecutor(model)
        else:
            _executor = GUIExecutor()
    return _executor


# ============================================================================
# RPC 方法
# ============================================================================


async def execute(task: str, max_steps: int = 10) -> dict[str, Any]:
    """
    执行 GUI 任务

    Args:
        task: 任务描述
        max_steps: 最大步数

    Returns:
        执行结果
    """
    executor = get_executor()
    return await executor.execute_task(task, max_steps)


async def click(x: int, y: int) -> dict[str, Any]:
    """点击坐标"""
    if USE_REAL_MODELS:
        try:
            import pyautogui

            pyautogui.click(x, y)
            return {"success": True, "action": "click", "x": x, "y": y}
        except Exception as e:
            return {"success": False, "error": str(e)}
    else:
        return {"success": True, "action": "click", "x": x, "y": y, "note": "MOCK"}


async def type_text(text: str) -> dict[str, Any]:
    """输入文字"""
    if USE_REAL_MODELS:
        try:
            import pyautogui

            pyautogui.typewrite(text)
            return {"success": True, "action": "type", "text": text}
        except Exception as e:
            return {"success": False, "error": str(e)}
    else:
        return {"success": True, "action": "type", "text": text, "note": "MOCK"}


async def screenshot() -> dict[str, Any]:
    """屏幕截图"""
    try:
        import pyautogui

        img = pyautogui.screenshot()
        path = f"/tmp/gui_screenshot_{int(time.time())}.png"
        img.save(path)
        return {"success": True, "path": path}
    except Exception as e:
        return {"success": False, "error": str(e)}
