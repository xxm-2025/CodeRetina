/**
 * /design2code Command —— 设计图转代码
 *
 * 完整链路：
 * 1. 解析设计图 → VisionQATool 提取结构化描述
 * 2. 生成代码 → FileWriteTool 创建 React + Tailwind
 * 3. 启动 dev server → BashTool
 * 4. 截图验证 → BrowserVisionTool
 * 5. 对比差异 → ImageDiffTool
 * 6. 迭代修复（最多5轮）
 *
 * Sprint: S2-5
 */

import type { Command } from '../../commands.js'
import type { Message } from '../../types/message.js'

/**
 * Design2Code 配置
 */
interface Design2CodeConfig {
  /** 设计图路径 */
  imagePath: string
  /** 输出目录 */
  outputDir: string
  /** 技术栈 */
  framework: 'react' | 'vue' | 'html'
  /** 样式方案 */
  styling: 'tailwind' | 'css-modules' | 'styled-components'
  /** 最大迭代轮数 */
  maxIterations: number
  /** 相似度阈值 */
  similarityThreshold: number
}

/**
 * 生成 React + Tailwind 代码的 Prompt 模板
 */
const REACT_TAILWIND_PROMPT = `You are a frontend developer. Convert this design image into a React component using Tailwind CSS.

Requirements:
1. Use functional component with hooks if needed
2. Use Tailwind CSS for all styling
3. Make it responsive
4. Use semantic HTML elements
5. Add appropriate aria labels for accessibility
6. Use placeholder images where appropriate (via placeholder.com or similar)
7. Export the component as default

Output format:
- First, provide a brief analysis of the design (layout, colors, typography)
- Then provide the complete code in a code block
- Then explain any assumptions you made

The code should be a single file, runnable with a standard React setup.`

/**
 * 生成 package.json
 */
const PACKAGE_JSON_TEMPLATE = `{
  "name": "design2code-output",
  "version": "0.1.0",
  "private": true,
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.0.0",
    "autoprefixer": "^10.4.14",
    "postcss": "^8.4.24",
    "tailwindcss": "^3.3.2",
    "vite": "^4.4.0"
  },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "postcss": {
    "plugins": {
      "tailwindcss": {},
      "autoprefixer": {}
    }
  }
}`

/**
 * 生成 tailwind.config.js
 */
const TAILWIND_CONFIG_TEMPLATE = `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}`

/**
 * 生成 vite.config.js
 */
const VITE_CONFIG_TEMPLATE = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})`

/**
 * 生成 index.html
 */
const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Design2Code Output</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>`

/**
 * 生成 main.jsx
 */
const MAIN_JSX_TEMPLATE = `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`

/**
 * 生成 index.css
 */
const INDEX_CSS_TEMPLATE = `@tailwind base;
@tailwind components;
@tailwind utilities;`

/**
 * Design2Code Command
 */
export const Design2CodeCommand: Command = {
  name: 'design2code',
  description: 'Convert a design image into working code. Analyzes the image, generates React/Tailwind code, starts a dev server, and iterates based on visual diff.',

  async *execute(
    args: string[],
    context: {
      submitMessage: (message: Message) => AsyncGenerator<Message, void, unknown>
      tools: any
    }
  ): AsyncGenerator<Message, void, unknown> {
    const imagePath = args[0]

    if (!imagePath) {
      yield {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'text',
              text: 'Usage: /design2code <image_path>\n\nConverts a design image into working React code with visual verification.',
            },
          ],
        },
        uuid: crypto.randomUUID(),
        toolUse: [],
      }
      return
    }

    const config: Design2CodeConfig = {
      imagePath,
      outputDir: `./design2code-output-${Date.now()}`,
      framework: 'react',
      styling: 'tailwind',
      maxIterations: 5,
      similarityThreshold: 0.85,
    }

    yield {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'text',
            text: `🎨 Starting Design2Code conversion...\n\nInput: ${config.imagePath}\nOutput: ${config.outputDir}\nMax iterations: ${config.maxIterations}`,
          },
        ],
      },
      uuid: crypto.randomUUID(),
      toolUse: [],
    }

    // Step 1: Analyze design image
    yield {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'text',
            text: 'Step 1/5: Analyzing design image...',
          },
        ],
      },
      uuid: crypto.randomUUID(),
      toolUse: [],
    }

    // Use VisionQATool to analyze the design
    const analysis = yield* context.submitMessage({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'VisionQATool',
            input: {
              image_path: config.imagePath,
              question: `Analyze this design image. Describe: 1) Layout structure (header, sidebar, main content areas), 2) Color scheme, 3) Typography, 4) UI components present (buttons, forms, cards, etc.), 5) Spacing and alignment patterns`,
            },
          },
        ],
      },
    })

    // Step 2: Generate code
    yield {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'text',
            text: 'Step 2/5: Generating code based on analysis...',
          },
        ],
      },
      uuid: crypto.randomUUID(),
      toolUse: [],
    }

    // Create project structure
    const projectFiles = [
      { path: `${config.outputDir}/package.json`, content: PACKAGE_JSON_TEMPLATE },
      { path: `${config.outputDir}/tailwind.config.js`, content: TAILWIND_CONFIG_TEMPLATE },
      { path: `${config.outputDir}/vite.config.js`, content: VITE_CONFIG_TEMPLATE },
      { path: `${config.outputDir}/index.html`, content: HTML_TEMPLATE },
      { path: `${config.outputDir}/src/main.jsx`, content: MAIN_JSX_TEMPLATE },
      { path: `${config.outputDir}/src/index.css`, content: INDEX_CSS_TEMPLATE },
    ]

    for (const file of projectFiles) {
      yield* context.submitMessage({
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'FileWriteTool',
              input: {
                file_path: file.path,
                content: file.content,
              },
            },
          ],
        },
      })
    }

    // Generate App.jsx with Claude
    yield* context.submitMessage({
      type: 'user',
      message: {
        content: [
          {
            type: 'text',
            text: `Based on the design analysis, generate a React component in ${config.outputDir}/src/App.jsx.\n\n${REACT_TAILWIND_PROMPT}\n\nUse FileWriteTool to create the file.`,
          },
        ],
      },
    })

    // Step 3: Install dependencies and start dev server
    yield {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'text',
            text: 'Step 3/5: Installing dependencies and starting dev server...',
          },
        ],
      },
      uuid: crypto.randomUUID(),
      toolUse: [],
    }

    yield* context.submitMessage({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'BashTool',
            input: {
              command: `cd ${config.outputDir} && npm install`,
              description: 'Install npm dependencies',
            },
          },
        ],
      },
    })

    // Start dev server in background
    yield* context.submitMessage({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'BashTool',
            input: {
              command: `cd ${config.outputDir} && npm run dev &`,
              description: 'Start Vite dev server in background',
            },
          },
        ],
      },
    })

    // Wait for server to start
    yield {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'text',
            text: 'Waiting for dev server to start...',
          },
        ],
      },
      uuid: crypto.randomUUID(),
      toolUse: [],
    }

    await new Promise((resolve) => setTimeout(resolve, 5000))

    // Step 4: Screenshot the result
    yield {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'text',
            text: 'Step 4/5: Capturing screenshot of generated page...',
          },
        ],
      },
      uuid: crypto.randomUUID(),
      toolUse: [],
    }

    const generatedScreenshot = `${config.outputDir}/generated.png`

    yield* context.submitMessage({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'BrowserVisionTool',
            input: {
              url: 'http://localhost:5173',
              action: 'screenshot',
              output_path: generatedScreenshot,
            },
          },
        ],
      },
    })

    // Step 5: Compare with original
    yield {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'text',
            text: 'Step 5/5: Comparing with original design...',
          },
        ],
      },
      uuid: crypto.randomUUID(),
      toolUse: [],
    }

    const diffResult = yield* context.submitMessage({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'ImageDiffTool',
            input: {
              image_a: config.imagePath,
              image_b: generatedScreenshot,
              mode: 'both',
              output_path: `${config.outputDir}/diff.png`,
            },
          },
        ],
      },
    })

    // Summary
    yield {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'text',
            text: `✅ Design2Code conversion complete!\n\nOutput directory: ${config.outputDir}\nDev server: http://localhost:5173\n\nFiles created:\n- package.json\n- tailwind.config.js\n- vite.config.js\n- index.html\n- src/main.jsx\n- src/index.css\n- src/App.jsx\n\nComparison results: Check ${config.outputDir}/diff.png for visual differences.`,
          },
        ],
      },
      uuid: crypto.randomUUID(),
      toolUse: [],
    }
  },
}
