"""
视频处理 —— 关键帧抽取、Chapter 摘要、视频 QA

功能:
- video.extract_keyframes: 使用 PySceneDetect 抽取关键帧
- video.summarize: Chapter 摘要 + 首帧嵌入
- video.qa: 视频问答（多帧 VLM）

Sprint: S6-B2, S6-B3, S6-B4
"""

from __future__ import annotations

import logging
import os
import subprocess
import time
from pathlib import Path
from typing import Any

from PIL import Image

# 可选导入: PySceneDetect
try:
    from scenedetect import detect, ContentDetector
    HAS_SCENEDETECT = True
except ImportError:
    HAS_SCENEDETECT = False

logger = logging.getLogger(__name__)

# Mock 模式标志
USE_REAL_MODELS = False


async def extract_keyframes(
    video_path: str,
    output_dir: str | None = None,
    method: str = "scenedetect",
    max_frames: int = 16,
    min_scene_len: float = 1.0,
) -> dict[str, Any]:
    """
    从视频抽取关键帧

    Args:
        video_path: 视频文件路径
        output_dir: 输出目录（默认视频同级目录/keyframes）
        method: 抽取方法（scenedetect = 镜头检测, uniform = 均匀采样, hybrid = 混合）
        max_frames: 最大帧数
        min_scene_len: 最小场景长度（秒）

    Returns:
        {
            "keyframes": [{"path": str, "timestamp": float, "method": str}],
            "total_scenes": int,
            "output_dir": str,
            "latency_ms": int,
        }
    """
    start_time = time.time()

    if not os.path.exists(video_path):
        return {
            "error": f"Video not found: {video_path}",
            "keyframes": [],
            "total_scenes": 0,
        }

    # 设置输出目录
    if output_dir is None:
        video_dir = os.path.dirname(video_path)
        video_name = Path(video_path).stem
        output_dir = os.path.join(video_dir, f"{video_name}_keyframes")
    os.makedirs(output_dir, exist_ok=True)

    logger.info(f"[extract_keyframes] video={video_path}, method={method}, max_frames={max_frames}")

    keyframes = []

    if method == "scenedetect" and HAS_SCENEDETECT:
        # 使用 PySceneDetect 进行镜头检测
        keyframes = _extract_with_scenedetect(video_path, output_dir, max_frames, min_scene_len)
    elif method == "uniform":
        # 均匀采样
        keyframes = _extract_uniform(video_path, output_dir, max_frames)
    else:
        # Mock 模式：生成模拟的关键帧
        keyframes = _mock_extract_keyframes(video_path, output_dir, max_frames)

    latency_ms = int((time.time() - start_time) * 1000)

    return {
        "keyframes": keyframes,
        "total_scenes": len(keyframes),
        "output_dir": output_dir,
        "latency_ms": latency_ms,
        "method": method if HAS_SCENEDETECT else "mock",
    }


def _extract_with_scenedetect(
    video_path: str,
    output_dir: str,
    max_frames: int,
    min_scene_len: float,
) -> list[dict[str, Any]]:
    """使用 PySceneDetect 抽取关键帧"""
    keyframes = []

    try:
        # 检测场景
        scene_list = detect(video_path, ContentDetector(min_scene_len=min_scene_len))

        logger.info(f"[scenedetect] Detected {len(scene_list)} scenes")

        # 如果场景太多，采样
        if len(scene_list) > max_frames:
            step = len(scene_list) // max_frames
            scene_list = scene_list[::step][:max_frames]

        # 提取每个场景的首帧
        for i, scene in enumerate(scene_list):
            start_time = scene[0].get_seconds()
            output_path = os.path.join(output_dir, f"frame_{i:04d}_{start_time:.2f}s.png")

            # 使用 ffmpeg 提取帧
            _extract_frame_at_time(video_path, start_time, output_path)

            keyframes.append({
                "path": output_path,
                "timestamp": start_time,
                "method": "scenedetect",
                "scene_idx": i,
            })

    except Exception as e:
        logger.error(f"[scenedetect] Error: {e}")
        # 降级到均匀采样
        return _extract_uniform(video_path, output_dir, max_frames)

    return keyframes


def _extract_uniform(
    video_path: str,
    output_dir: str,
    max_frames: int,
) -> list[dict[str, Any]]:
    """均匀采样抽取关键帧"""
    keyframes = []

    try:
        # 获取视频时长
        duration = _get_video_duration(video_path)
        if duration <= 0:
            logger.warning("[uniform] Could not get video duration")
            return _mock_extract_keyframes(video_path, output_dir, max_frames)

        # 均匀间隔
        interval = duration / (max_frames + 1)

        for i in range(max_frames):
            timestamp = interval * (i + 1)
            output_path = os.path.join(output_dir, f"frame_{i:04d}_{timestamp:.2f}s.png")

            _extract_frame_at_time(video_path, timestamp, output_path)

            keyframes.append({
                "path": output_path,
                "timestamp": timestamp,
                "method": "uniform",
                "frame_idx": i,
            })

    except Exception as e:
        logger.error(f"[uniform] Error: {e}")
        return _mock_extract_keyframes(video_path, output_dir, max_frames)

    return keyframes


def _mock_extract_keyframes(
    video_path: str,
    output_dir: str,
    max_frames: int,
) -> list[dict[str, Any]]:
    """Mock 模式：生成测试用的关键帧"""
    keyframes = []

    # 创建一些简单的测试图像
    for i in range(min(max_frames, 5)):
        timestamp = i * 60  # 每分钟一帧
        output_path = os.path.join(output_dir, f"frame_{i:04d}_{timestamp:.2f}s.png")

        # 创建一个简单的测试图像
        img = Image.new('RGB', (640, 360), color=(40 + i * 40, 50 + i * 30, 60 + i * 20))
        img.save(output_path)

        keyframes.append({
            "path": output_path,
            "timestamp": float(timestamp),
            "method": "mock",
            "frame_idx": i,
        })

    logger.info(f"[mock] Generated {len(keyframes)} mock keyframes")
    return keyframes


def _extract_frame_at_time(video_path: str, timestamp: float, output_path: str) -> bool:
    """使用 ffmpeg 在指定时间提取单帧"""
    try:
        cmd = [
            "ffmpeg",
            "-ss", str(timestamp),
            "-i", video_path,
            "-frames:v", "1",
            "-q:v", "2",
            "-y",
            output_path,
        ]
        subprocess.run(cmd, capture_output=True, check=True, timeout=30)
        return os.path.exists(output_path)
    except Exception as e:
        logger.error(f"[ffmpeg] Failed to extract frame at {timestamp}s: {e}")
        return False


def _get_video_duration(video_path: str) -> float:
    """获取视频时长（秒）"""
    try:
        cmd = [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            video_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        return float(result.stdout.strip())
    except Exception as e:
        logger.error(f"[ffprobe] Failed to get duration: {e}")
        return 0.0


async def summarize(
    video_path: str,
    max_frames: int = 16,
    vlm_model: str = "moondream2",
) -> dict[str, Any]:
    """
    视频 Chapter 摘要

    流程:
    1. 抽取关键帧
    2. 每帧送 VLM 生成描述
    3. 合并为 Chapter 摘要
    4. 首帧嵌入 SigLIP2（用于检索）

    Args:
        video_path: 视频路径
        max_frames: 关键帧数量（默认 16）
        vlm_model: VLM 模型

    Returns:
        {
            "chapters": [{"start": float, "end": float, "summary": str, "frame_path": str}],
            "total_chapters": int,
            "video_path": str,
            "embedding_ids": list,  // LanceDB 中的 ID
        }
    """
    start_time = time.time()

    # 1. 抽取关键帧
    keyframes_result = await extract_keyframes(
        video_path,
        method="hybrid" if HAS_SCENEDETECT else "mock",
        max_frames=max_frames,
    )

    keyframes = keyframes_result.get("keyframes", [])
    if not keyframes:
        return {
            "error": "No keyframes extracted",
            "chapters": [],
            "total_chapters": 0,
            "video_path": video_path,
            "latency_ms": int((time.time() - start_time) * 1000),
        }

    # 2. 为每帧生成描述（Mock 或真实 VLM）
    chapters = []
    for i, frame in enumerate(keyframes):
        timestamp = frame["timestamp"]
        frame_path = frame["path"]

        # 计算 chapter 时间范围
        start_ts = timestamp
        end_ts = keyframes[i + 1]["timestamp"] if i + 1 < len(keyframes) else timestamp + 60

        # 生成描述（Mock 或真实 VLM）
        if USE_REAL_MODELS:
            # 真实实现：调用 VLM
            description = await _describe_frame_with_vlm(frame_path, vlm_model)
        else:
            # Mock 描述
            description = _mock_describe_frame(i, timestamp)

        chapters.append({
            "start": start_ts,
            "end": end_ts,
            "summary": description,
            "frame_path": frame_path,
            "frame_idx": i,
        })

    # 3. 首帧嵌入（后续 S6-B5 实现）
    embedding_ids = []

    latency_ms = int((time.time() - start_time) * 1000)

    return {
        "chapters": chapters,
        "total_chapters": len(chapters),
        "video_path": video_path,
        "keyframes": keyframes,
        "embedding_ids": embedding_ids,
        "latency_ms": latency_ms,
    }


async def _describe_frame_with_vlm(frame_path: str, model: str) -> str:
    """使用 VLM 描述帧内容"""
    # 实际实现：调用 vlm.caption
    from . import vlm as vlm_module
    result = await vlm_module.caption(frame_path, model=model, prompt="describe")
    return result.get("text", "No description")


def _mock_describe_frame(frame_idx: int, timestamp: float) -> str:
    """Mock 帧描述"""
    minute = int(timestamp // 60)
    descriptions = [
        f"Coding activity at minute {minute}. IDE is open with TypeScript code.",
        f"Browser window showing documentation at minute {minute}.",
        f"Terminal window with running commands at minute {minute}.",
        f"Multiple windows: IDE and browser side by side at minute {minute}.",
        f"Debugging session with breakpoints at minute {minute}.",
        f"Code review or git diff view at minute {minute}.",
        f"Testing interface or test results at minute {minute}.",
        f"Deployment or CI/CD dashboard at minute {minute}.",
    ]
    return descriptions[frame_idx % len(descriptions)]


async def qa(
    video_path: str,
    prompt: str,
    frames: int = 16,
    time_range: list[float] | None = None,
    vlm_model: str = "moondream2",
) -> dict[str, Any]:
    """
    视频问答 —— 多帧 VLM 推理

    Args:
        video_path: 视频路径
        prompt: 问题
        frames: 采样帧数
        time_range: 可选时间范围 [start, end]（秒）
        vlm_model: VLM 模型（实际用 Qwen2.5-VL-7B 等多帧模型）

    Returns:
        {
            "answer": str,
            "confidence": float,
            "relevant_frames": [{"path": str, "timestamp": float}],
            "video_path": str,
        }
    """
    start_time = time.time()

    # 1. 抽取关键帧（限制在时间范围内）
    keyframes_result = await extract_keyframes(
        video_path,
        max_frames=frames,
        method="uniform",
    )

    keyframes = keyframes_result.get("keyframes", [])

    # 过滤时间范围
    if time_range and len(time_range) == 2:
        start_ts, end_ts = time_range
        keyframes = [
            f for f in keyframes
            if start_ts <= f["timestamp"] <= end_ts
        ]

    if not keyframes:
        return {
            "answer": "No relevant frames found in the specified time range.",
            "confidence": 0.0,
            "relevant_frames": [],
            "video_path": video_path,
        }

    # 2. 多帧 QA（Mock 或真实 VLM）
    if USE_REAL_MODELS:
        # 真实实现：使用 Qwen2.5-VL-7B 等多帧模型
        answer = await _qa_with_multiframe_vlm(keyframes, prompt, vlm_model)
        confidence = 0.85
    else:
        # Mock QA
        answer = _mock_video_qa(prompt, keyframes)
        confidence = 0.78

    latency_ms = int((time.time() - start_time) * 1000)

    return {
        "answer": answer,
        "confidence": confidence,
        "relevant_frames": [{"path": f["path"], "timestamp": f["timestamp"]} for f in keyframes[:4]],
        "video_path": video_path,
        "latency_ms": latency_ms,
        "model": vlm_model,
    }


async def _qa_with_multiframe_vlm(
    keyframes: list[dict],
    prompt: str,
    model: str,
) -> str:
    """使用多帧 VLM 进行视频 QA"""
    # 实际实现：调用 Qwen2.5-VL-7B 或 VideoLLaMA3
    # 这些模型原生支持多帧输入
    logger.info(f"[qa] Multi-frame inference with {len(keyframes)} frames")

    # 简化实现：返回最后一个 VLM 的回答
    from . import vlm as vlm_module

    # 选择关键帧（第一帧、中间、最后一帧）
    selected_indices = [0, len(keyframes) // 2, len(keyframes) - 1]
    selected_frames = [keyframes[i] for i in selected_indices if i < len(keyframes)]

    # 对每个关键帧提问
    answers = []
    for frame in selected_frames:
        result = await vlm_module.query(frame["path"], prompt, model=model)
        answers.append(result.get("answer", ""))

    # 合并答案（简化）
    return f"Based on the video: {answers[-1]}"


def _mock_video_qa(prompt: str, keyframes: list[dict]) -> str:
    """Mock 视频 QA"""
    prompt_lower = prompt.lower()

    # 根据问题类型返回不同的 mock 答案
    if "what" in prompt_lower and ("do" in prompt_lower or "happen" in prompt_lower):
        return "The video shows a coding session with IDE navigation, browser interactions, and terminal commands. The user was working on a TypeScript project with multiple file edits."

    if "when" in prompt_lower and ("error" in prompt_lower or "fail" in prompt_lower):
        # 模拟定位错误时间点
        if keyframes:
            error_ts = keyframes[len(keyframes) // 2]["timestamp"]
            return f"An error occurred at approximately {error_ts:.0f} seconds into the video. The terminal shows a build failure."

    if "how many" in prompt_lower:
        return "Based on the video, there were approximately 5 main activity segments including coding, testing, and documentation review."

    if "first" in prompt_lower or "start" in prompt_lower:
        return "At the start of the video, the user opened the IDE and began editing a TypeScript file in the src/commands directory."

    if "end" in prompt_lower or "last" in prompt_lower:
        return "Towards the end, the user was running tests and reviewing the output in the terminal."

    return "The video captures a typical software development workflow with code editing, browser testing, and terminal interactions."


async def list_sessions(sessions_dir: str | None = None) -> dict[str, Any]:
    """
    列出所有录制的 session

    Args:
        sessions_dir: sessions 目录（默认 ~/.claude/sessions）

    Returns:
        {
            "sessions": [{"id": str, "video_path": str, "created": str, "duration_sec": float}],
        }
    """
    if sessions_dir is None:
        sessions_dir = os.path.expanduser("~/.claude/sessions")

    sessions = []

    try:
        for filename in os.listdir(sessions_dir):
            if filename.endswith('.mp4'):
                video_path = os.path.join(sessions_dir, filename)

                # 解析文件名: {id}_{timestamp}.mp4
                parts = filename.replace('.mp4', '').split('_')
                session_id = parts[0] if parts else 'unknown'
                timestamp = '_'.join(parts[1:]) if len(parts) > 1 else ''

                # 获取视频信息
                duration = _get_video_duration(video_path)
                stat = os.stat(video_path)

                sessions.append({
                    "id": session_id,
                    "video_path": video_path,
                    "filename": filename,
                    "created": timestamp,
                    "duration_sec": duration,
                    "size_mb": stat.st_size / (1024 * 1024),
                })

        # 按时间排序（新的在前）
        sessions.sort(key=lambda x: x["created"], reverse=True)

    except Exception as e:
        logger.error(f"[list_sessions] Error: {e}")

    return {
        "sessions": sessions,
        "total": len(sessions),
        "sessions_dir": sessions_dir,
    }
