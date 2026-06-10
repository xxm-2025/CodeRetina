# Vision Sidecar

CodeRetina 项目的 Python 视觉处理服务，通过 stdio JSON-RPC 与 TypeScript 主进程通信。

## 功能

- **VLM 服务**: 图像描述、视觉问答 (Moondream, MiniCPM-V)
- **目标检测**: YOLO 物体检测
- **UI 解析**: 屏幕元素识别 (OmniParser)
- **OCR**: 文字识别
- **图像处理**: 对比、标注、嵌入

## 快速开始

```bash
# 安装依赖 (使用 uv)
cd vision_sidecar
uv sync

# 运行 echo 测试
uv run python -m vision_sidecar.server --echo-test

# 完整启动
uv run python -m vision_sidecar.server
```

## 架构

```
vision_sidecar/
├── vision_sidecar/
│   ├── server.py      # JSON-RPC 服务器
│   ├── registry.py    # 方法注册表
│   └── methods/       # RPC 方法实现
│       ├── vlm.py     # 视觉语言模型
│       ├── detect.py  # 目标检测
│       └── ...
└── run.py             # 入口脚本
```

## 通信协议

详见 `docs/02_sidecar_protocol.md`

## 许可证

MIT
