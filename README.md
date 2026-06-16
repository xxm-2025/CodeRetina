# CodeRetina

CodeRetina is a course project that extends a text-oriented coding agent with visual perception and verification capabilities for computer-use scenarios. The system adds screenshot capture, OCR, UI parsing, visual question answering, image diffing, GUI action planning, video replay, and multimodal document retrieval to the agent tool loop.

The core idea is to turn visual inputs into structured context that an agent can use for multi-step work:

```text
observe -> understand -> plan -> act -> verify -> remember
```

## Project Goals

- Add a visual context layer to a coding-agent workflow.
- Convert screenshots, UI elements, videos, and document regions into structured data.
- Support GUI dry-run planning and visual result verification.
- Demonstrate reusable scenarios including Screenshot-to-Code, Visual Debug, Video Replay, and Doc RAG.
- Keep vision models replaceable through a sidecar and router architecture.

## Architecture

CodeRetina uses a two-process design:

- `src/`: TypeScript agent-side commands, tools, router, and integration code.
- `vision_sidecar/`: Python JSON-RPC sidecar for vision models, image processing, video analysis, and document retrieval.

The TypeScript process keeps the agent command and tool loop, while the Python sidecar handles the vision ecosystem. They communicate through JSON-RPC over stdio.

```text
User task
  -> Agent tool loop
     -> Code tools: file / search / shell / edit
     -> Vision tools: screenshot / OCR / UI parse / VQA / diff / RAG
        -> Hybrid Vision Router
           -> Python Vision Sidecar
```

## Key Features

- **Vision toolchain**: screenshot, browser screenshot, OCR, UI parsing, VQA, image diff, annotation, video QA, and document RAG.
- **Hybrid vision routing**: routes visual tasks across local models and cloud models based on task type, confidence, budget, and cache.
- **GUI planning**: supports `click`, `type`, `scroll`, `hotkey`, `wait`, and screenshot-based dry-run planning.
- **Visual verification**: compares before/after screenshots, UI element trees, and VLM judgments to check whether a task succeeded.
- **Long-form inputs**: supports video replay and multimodal document retrieval in addition to single screenshots.

## Repository Layout

```text
CodeRetina/
├── src/
│   ├── tools/vision/      # Agent-facing vision tools
│   ├── vision/            # Sidecar client, router, types, visual utilities
│   └── commands/          # /gui /design2code /visual-debug /replay /doc
├── vision_sidecar/        # Python vision sidecar
├── scripts/               # Demo and test scripts
├── docs/                  # Architecture and protocol notes
├── tests/                 # Focused regression tests
└── eval/                  # Lightweight benchmark fixtures and runners
```

## Representative Demos

- **GUI dry-run**: parse a screen and generate a safe action plan without operating the real desktop.
- **Screenshot-to-Code**: generate UI code from a reference image and verify the browser rendering through screenshot diff.
- **Visual Debug**: inspect screenshots or UI states to locate visual bugs.
- **Video Replay**: extract frames from recordings and answer questions about the operation process.
- **Doc RAG**: retrieve evidence from chart-heavy or table-heavy documents.

## Running the Vision Sidecar

```bash
cd vision_sidecar
uv sync
uv run python -m vision_sidecar.server --echo-test
```

Optional model backends may require additional local model files or cloud API configuration. Do not commit API keys or local model weights.

## Notes

This repository is organized as the runnable CodeRetina project. Generated outputs, model weights, local caches, planning notes, report files, and temporary assets are excluded through `.gitignore`.
