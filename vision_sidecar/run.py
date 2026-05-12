#!/usr/bin/env python3
"""
Vision Sidecar 入口脚本

用法:
    python run.py              # 启动服务器
    python run.py --echo-test  # 运行 echo 测试
    python run.py --help       # 显示帮助
"""

import sys

# 确保可以导入 vision_sidecar 包
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))

from vision_sidecar.server import main

if __name__ == "__main__":
    import asyncio

    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 再见！", file=sys.stderr)
        sys.exit(0)
