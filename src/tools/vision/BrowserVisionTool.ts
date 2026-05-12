/**
 * BrowserVisionTool —— 浏览器视觉工具
 *
 * 使用 Playwright 控制 headless 浏览器：
 * - 截取网页截图
 * - 获取 DOM 结构
 * - 执行 JavaScript
 * - 模拟用户交互（点击、输入等）
 *
 * Sprint: S2-2
 */

import type { Tool, ToolInputJSONSchema, ToolUseContext } from '../../Tool.js'
import type { YieldResult, ReturnResult } from '../../Tool.js'

/**
 * 视口配置
 */
interface ViewportConfig {
  width: number
  height: number
  deviceScaleFactor?: number
}

/**
 * BrowserVisionTool 输入 Schema
 */
const inputSchema: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    url: {
      type: 'string',
      description: '目标网页 URL（支持 file:// 协议）',
    },
    action: {
      type: 'string',
      enum: ['screenshot', 'screenshot_full', 'get_dom', 'execute_js', 'click', 'type'],
      description: '操作类型：截图 / 完整页面截图 / 获取 DOM / 执行 JS / 点击元素 / 输入文字',
      default: 'screenshot',
    },
    output_path: {
      type: 'string',
      description: '截图输出路径（默认临时目录）',
    },
    viewport: {
      type: 'object',
      description: '浏览器视口尺寸',
      properties: {
        width: { type: 'number', default: 1280 },
        height: { type: 'number', default: 720 },
        deviceScaleFactor: { type: 'number', default: 1 },
      },
    },
    selector: {
      type: 'string',
      description: 'CSS 选择器（用于 click/type 操作）',
    },
    text: {
      type: 'string',
      description: '要输入的文字（action=type 时使用）',
    },
    js_code: {
      type: 'string',
      description: '要执行的 JavaScript 代码（action=execute_js 时使用）',
    },
    wait_for: {
      type: 'string',
      description: '等待条件：load/domcontentloaded/networkidle/selector',
      default: 'networkidle',
    },
    wait_timeout: {
      type: 'number',
      description: '等待超时（毫秒）',
      default: 30000,
    },
    full_page: {
      type: 'boolean',
      description: '是否截取完整页面（action=screenshot 时）',
      default: false,
    },
  },
  required: ['url'],
}

/**
 * Playwright 动态导入类型
 */
type PlaywrightModule = typeof import('playwright-core')
type Browser = import('playwright-core').Browser
type Page = import('playwright-core').Page

/**
 * 获取 Playwright 实例（动态导入）
 */
async function getPlaywright(): Promise<PlaywrightModule> {
  try {
    return await import('playwright-core')
  } catch {
    throw new Error(
      'playwright-core 未安装。请运行: bun add playwright-core && bunx playwright install chromium'
    )
  }
}

/**
 * BrowserVisionTool 实现
 */
export const BrowserVisionTool: Tool = {
  name: 'BrowserVisionTool',

  description: '使用 Playwright 控制 headless 浏览器，截取网页截图、获取 DOM 结构或执行 JavaScript。支持模拟用户交互（点击、输入）。',

  inputJSONSchema,

  userFacingName() {
    return 'Browser Vision'
  },

  async *call(
    args: unknown,
    context: ToolUseContext,
    toolUse: unknown
  ): AsyncGenerator<YieldResult, ReturnResult> {
    const params = args as {
      url: string
      action?: 'screenshot' | 'screenshot_full' | 'get_dom' | 'execute_js' | 'click' | 'type'
      output_path?: string
      viewport?: ViewportConfig
      selector?: string
      text?: string
      js_code?: string
      wait_for?: 'load' | 'domcontentloaded' | 'networkidle' | 'selector'
      wait_timeout?: number
      full_page?: boolean
    }

    if (!params.url) {
      return {
        type: 'tool_result',
        content: '错误: 缺少 url 参数',
        is_error: true,
      }
    }

    const action = params.action || 'screenshot'
    const viewport: ViewportConfig = params.viewport || { width: 1280, height: 720, deviceScaleFactor: 1 }
    const waitFor = params.wait_for || 'networkidle'
    const waitTimeout = params.wait_timeout || 30000

    let browser: Browser | null = null

    try {
      yield {
        type: 'progress',
        message: '正在启动浏览器...',
      }

      const playwright = await getPlaywright()

      // 启动 Chromium
      browser = await playwright.chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      })

      const page = await browser.newPage({
        viewport: {
          width: viewport.width,
          height: viewport.height,
          deviceScaleFactor: viewport.deviceScaleFactor || 1,
        },
      })

      yield {
        type: 'progress',
        message: `正在加载页面: ${params.url}...`,
      }

      // 导航到页面
      await page.goto(params.url, {
        waitUntil: waitFor as any,
        timeout: waitTimeout,
      })

      yield {
        type: 'progress',
        message: '页面加载完成，执行操作中...',
      }

      let result: string

      switch (action) {
        case 'screenshot':
        case 'screenshot_full': {
          const outputPath =
            params.output_path || `/tmp/browser_screenshot_${Date.now()}.png`

          await page.screenshot({
            path: outputPath,
            fullPage: action === 'screenshot_full' || params.full_page,
          })

          result = `截图已保存: ${outputPath}\n视口: ${viewport.width}x${viewport.height}`
          break
        }

        case 'get_dom': {
          // 获取简化的 DOM 结构
          const domInfo = await page.evaluate(() => {
            const extractElements = (element: Element, depth = 0): any => {
              if (depth > 3) return null // 限制深度

              const tagName = element.tagName.toLowerCase()
              const rect = element.getBoundingClientRect()

              // 只提取关键元素
              const isInteractive =
                element.tagName === 'BUTTON' ||
                element.tagName === 'A' ||
                element.tagName === 'INPUT' ||
                element.getAttribute('role') === 'button'

              const children = Array.from(element.children)
                .map((child) => extractElements(child, depth + 1))
                .filter(Boolean)

              return {
                tag: tagName,
                id: element.id || undefined,
                class: element.className || undefined,
                text:
                  element.textContent?.slice(0, 100) || undefined,
                bounds:
                  isInteractive || children.length > 0
                    ? {
                        x: Math.round(rect.x),
                        y: Math.round(rect.y),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height),
                      }
                    : undefined,
                attributes: Array.from(element.attributes)
                  .filter((a) => ['id', 'class', 'href', 'src', 'alt', 'placeholder', 'type'].includes(a.name))
                  .reduce((acc, a) => ({ ...acc, [a.name]: a.value }), {}),
                children: children.length > 0 ? children : undefined,
              }
            }

            return {
              title: document.title,
              url: window.location.href,
              width: window.innerWidth,
              height: window.innerHeight,
              body: extractElements(document.body, 0),
            }
          })

          result = `DOM 结构:\n${JSON.stringify(domInfo, null, 2)}`
          break
        }

        case 'execute_js': {
          if (!params.js_code) {
            throw new Error('action=execute_js 时需要提供 js_code 参数')
          }

          const jsResult = await page.evaluate((code) => {
            try {
              // eslint-disable-next-line no-eval
              return { success: true, result: eval(code) }
            } catch (e) {
              return { success: false, error: String(e) }
            }
          }, params.js_code)

          result = `JavaScript 执行结果:\n${JSON.stringify(jsResult, null, 2)}`
          break
        }

        case 'click': {
          if (!params.selector) {
            throw new Error('action=click 时需要提供 selector 参数')
          }

          await page.click(params.selector)
          result = `已点击元素: ${params.selector}`
          break
        }

        case 'type': {
          if (!params.selector || !params.text) {
            throw new Error('action=type 时需要提供 selector 和 text 参数')
          }

          await page.fill(params.selector, params.text)
          result = `已在 ${params.selector} 输入: ${params.text}`
          break
        }

        default:
          throw new Error(`未知的操作类型: ${action}`)
      }

      await browser.close()

      return {
        type: 'tool_result',
        content: result,
      }
    } catch (error) {
      // 确保浏览器关闭
      if (browser) {
        await browser.close().catch(() => {})
      }

      const errorMessage = error instanceof Error ? error.message : String(error)

      return {
        type: 'tool_result',
        content: `浏览器操作失败: ${errorMessage}`,
        is_error: true,
      }
    }
  },

  isEnabled() {
    // 检查 Playwright 是否可用
    try {
      require.resolve('playwright-core')
      return true
    } catch {
      return false
    }
  },

  getCost() {
    return 2
  },
}
