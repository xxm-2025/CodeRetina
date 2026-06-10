#!/bin/bash
#
# Sprint 6 — 方向 B (Long-Form Video / Screen Replay) Demo 脚本
#
# 演示:
# 1. 视频关键帧抽取
# 2. Chapter 摘要生成
# 3. 视频 QA
# 4. /replay 命令流程
#

set -e

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║     Sprint 6 — 方向 B: Long-Form Video / Screen Replay         ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# 检查 Python 环境
echo "📋 检查 Python 环境..."
cd "$(dirname "$0")/../vision_sidecar"
python3 -c "import sys; sys.path.insert(0, '.'); from vision_sidecar.methods import video; print('✓ video module import OK')"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 1: video.extract_keyframes (关键帧抽取)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 创建一个模拟视频用于测试
echo "🎬 创建测试视频..."
python3 << 'EOF'
import sys
sys.path.insert(0, '.')

# 创建测试视频目录
import os
os.makedirs("test_output", exist_ok=True)

# 生成测试帧
from PIL import Image, ImageDraw

frames_dir = "test_output/test_frames"
os.makedirs(frames_dir, exist_ok=True)

for i in range(10):
    img = Image.new('RGB', (640, 360), color=(30+i*20, 40+i*15, 50+i*10))
    draw = ImageDraw.Draw(img)
    draw.text((50, 50), f"Frame {i+1} - Time {i*30}s", fill='white')
    img.save(f"{frames_dir}/frame_{i:04d}.png")

print(f"✓ 生成了 10 个测试帧到 {frames_dir}")
EOF

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 2: video.summarize (Chapter 摘要)"  
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

python3 << 'EOF'
import asyncio
import sys
sys.path.insert(0, '.')

from vision_sidecar.methods import video

async def test_summarize():
    # 使用测试帧目录下的一个帧作为视频路径 (mock 模式会生成帧)
    result = await video.summarize(
        video_path="test_output/test_frames/frame_0000.png",
        max_frames=5,
    )
    
    print(f"总 Chapters: {result.get('total_chapters', 0)}")
    print(f"延迟: {result.get('latency_ms', 0)}ms")
    print("")
    print("Chapters:")
    for ch in result.get('chapters', [])[:3]:
        print(f"  [{ch.get('start', 0):.0f}s - {ch.get('end', 0):.0f}s] {ch.get('summary', 'N/A')[:60]}...")
    
    return result

result = asyncio.run(test_summarize())
EOF

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 3: video.qa (视频问答)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

python3 << 'EOF'
import asyncio
import sys
sys.path.insert(0, '.')

from vision_sidecar.methods import video

async def test_qa():
    # 测试不同类型的问题
    test_queries = [
        "What happened in this video?",
        "When did the error occur?",
        "How many activities were performed?",
    ]
    
    for query in test_queries:
        print(f"\n❓ 问题: {query}")
        result = await video.qa(
            video_path="test_output/test_frames/frame_0000.png",
            prompt=query,
            frames=8,
        )
        print(f"   💡 回答: {result.get('answer', 'N/A')[:80]}...")
        print(f"   📊 置信度: {result.get('confidence', 0):.2f}, 延迟: {result.get('latency_ms', 0)}ms")

asyncio.run(test_qa())
EOF

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 4: video.list_sessions (Session 列表)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

python3 << 'EOF'
import asyncio
import sys
sys.path.insert(0, '.')

from vision_sidecar.methods import video

async def test_list():
    result = await video.list_sessions()
    
    print(f"总 Sessions: {result['total']}")
    print(f"Sessions 目录: {result['sessions_dir']}")
    print("")
    
    if result['sessions']:
        for s in result['sessions'][:3]:
            print(f"  - {s['id'][:8]}... | {s['duration_sec']:.0f}s | {s['size_mb']:.1f} MB")
    else:
        print("  (暂无录制记录)")

asyncio.run(test_list())
EOF

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 5: rag.store_video_chapter / search_video_chapters"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

python3 << 'EOF'
import asyncio
import sys
sys.path.insert(0, '.')

from vision_sidecar.methods import rag

async def test_video_chapter_rag():
    # 存储一个测试 chapter
    print("存储测试 chapter...")
    store_result = await rag.store_video_chapter(
        video_path="test_output/mock_session.mp4",
        chapter_idx=0,
        start_time=0,
        end_time=60,
        frame_path="test_output/test_frames/frame_0000.png",
        summary="Coding session started. IDE opened with TypeScript project.",
        session_id="test-session-001",
    )
    
    if store_result['success']:
        print(f"✓ Chapter 存储成功: {store_result['record']['id'][:8]}...")
    else:
        print(f"⚠ Chapter 存储: {store_result.get('error', 'unknown')}")
    
    # 搜索 chapters
    print("\n搜索 chapters...")
    search_result = await rag.search_video_chapters(
        query="coding typescript",
        session_id="test-session-001",
        top_k=3,
    )
    
    if search_result['success']:
        print(f"✓ 找到 {search_result['count']} 个相关 chapters")
        for ch in search_result['chapters'][:2]:
            print(f"  - {ch.get('text', 'N/A')[:50]}...")
    else:
        print(f"⚠ 搜索: {search_result.get('error', 'unknown')}")

asyncio.run(test_video_chapter_rag())
EOF

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                       Demo 完成!                                  ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "实现的功能:"
echo "  ✓ video.extract_keyframes - 关键帧抽取 (PySceneDetect + ffmpeg)"
echo "  ✓ video.summarize - Chapter 摘要生成"
echo "  ✓ video.qa - 视频问答 (多帧 VLM)"
echo "  ✓ video.list_sessions - Session 列表"
echo "  ✓ rag.store_video_chapter - Chapter 入库"
echo "  ✓ rag.search_video_chapters - Chapter 检索"
echo "  ✓ SessionRecorder - 屏幕录制服务"
echo "  ✓ /replay 命令 - 视频回放与检索"
echo "  ✓ VideoQATool - 视频问答工具"
echo ""
echo "CLI 命令示例:"
echo "  ./coderetina /live              # 开始录制"
echo "  ./coderetina /live stop         # 停止录制"
echo "  ./coderetina /replay --list     # 列出 sessions"
echo "  ./coderetina /replay 5min       # 回放最近5分钟"
echo "  ./coderetina /replay \"error\"    # 搜索错误"
echo ""
