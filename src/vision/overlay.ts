/**
 * Vision Overlay —— 屏幕标注渲染
 *
 * 独立窗口，实时显示 Set-of-Mark (SoM) 标注：
 * - 边界框
 * - 编号
 * - 可点击元素高亮
 *
 * Sprint: S4-4
 */

import { EventEmitter } from 'events'

/**
 * 标注元素
 */
interface OverlayElement {
  id: string
  type: 'box' | 'circle' | 'label' | 'highlight'
  x: number
  y: number
  width?: number
  height?: number
  label?: string
  color?: string
  opacity?: number
}

/**
 * 覆盖层配置
 */
interface OverlayConfig {
  width: number
  height: number
  transparent: boolean
  alwaysOnTop: boolean
  clickThrough: boolean
}

/**
 * VisionOverlay 类
 *
 * 渲染标注到独立窗口（使用 Electron 或 native 窗口）
 */
export class VisionOverlay extends EventEmitter {
  private config: OverlayConfig
  private elements: Map<string, OverlayElement> = new Map()
  private isVisible = false
  private window: any = null // 简化，实际应该用 Electron BrowserWindow

  constructor(config?: Partial<OverlayConfig>) {
    super()
    this.config = {
      width: 1920,
      height: 1080,
      transparent: true,
      alwaysOnTop: true,
      clickThrough: true,
      ...config,
    }
  }

  /**
   * 显示覆盖层窗口
   */
  async show(): Promise<void> {
    if (this.isVisible) {
      return
    }

    // 简化实现：实际应该用 Electron 创建透明窗口
    console.log('[Overlay] Creating transparent overlay window...')
    console.log(`  Size: ${this.config.width}x${this.config.height}`)
    console.log(`  Always on top: ${this.config.alwaysOnTop}`)
    console.log(`  Click through: ${this.config.clickThrough}`)

    this.isVisible = true
    this.emit('show')

    // 模拟窗口创建成功
    console.log('[Overlay] Window ready')
  }

  /**
   * 隐藏覆盖层
   */
  hide(): void {
    if (!this.isVisible) {
      return
    }

    this.isVisible = false
    this.emit('hide')

    console.log('[Overlay] Window hidden')
  }

  /**
   * 添加标注元素
   */
  addElement(element: OverlayElement): void {
    this.elements.set(element.id, element)
    this.render()
  }

  /**
   * 移除标注元素
   */
  removeElement(id: string): void {
    this.elements.delete(id)
    this.render()
  }

  /**
   * 清除所有元素
   */
  clear(): void {
    this.elements.clear()
    this.render()
  }

  /**
   * 更新元素
   */
  updateElement(id: string, updates: Partial<OverlayElement>): void {
    const element = this.elements.get(id)
    if (element) {
      this.elements.set(id, { ...element, ...updates })
      this.render()
    }
  }

  /**
   * 从 UI 解析结果生成标注
   */
  annotateUIParse(elements: Array<{ id: string; bounds: { x: number; y: number; width: number; height: number }; type: string; label?: string }>): void {
    this.clear()

    const colors: Record<string, string> = {
      button: '#3b82f6',
      input: '#10b981',
      text: '#6b7280',
      link: '#8b5cf6',
      image: '#f59e0b',
      container: '#ef4444',
    }

    for (const el of elements) {
      this.addElement({
        id: `ui-${el.id}`,
        type: 'box',
        x: el.bounds.x,
        y: el.bounds.y,
        width: el.bounds.width,
        height: el.bounds.height,
        label: el.label || el.type,
        color: colors[el.type] || '#6b7280',
        opacity: 0.8,
      })
    }

    console.log(`[Overlay] Added ${elements.length} UI elements`)
  }

  /**
   * 高亮特定区域
   */
  highlight(x: number, y: number, width: number, height: number, color = '#fbbf24'): void {
    this.addElement({
      id: 'highlight-current',
      type: 'highlight',
      x,
      y,
      width,
      height,
      color,
      opacity: 0.5,
    })
  }

  /**
   * 渲染（简化实现）
   */
  private render(): void {
    if (!this.isVisible) {
      return
    }

    // 实际实现应该通过 Electron 的 IPC 发送渲染指令
    // 这里仅打印日志
    console.log(`[Overlay] Rendering ${this.elements.size} elements:`)

    for (const [id, el] of this.elements) {
      const pos = el.width !== undefined ? `(${el.x}, ${el.y}, ${el.width}x${el.height})` : `(${el.x}, ${el.y})`
      console.log(`  ${id}: ${el.type} ${pos} [${el.color}]`)
    }
  }

  /**
   * 获取所有元素
   */
  getElements(): OverlayElement[] {
    return Array.from(this.elements.values())
  }

  /**
   * 销毁覆盖层
   */
  destroy(): void {
    this.hide()
    this.elements.clear()
    this.removeAllListeners()
    console.log('[Overlay] Destroyed')
  }
}

/**
 * 创建全局覆盖层实例
 */
let globalOverlay: VisionOverlay | null = null

export function getOverlay(): VisionOverlay {
  if (!globalOverlay) {
    globalOverlay = new VisionOverlay()
  }
  return globalOverlay
}

export function destroyOverlay(): void {
  if (globalOverlay) {
    globalOverlay.destroy()
    globalOverlay = null
  }
}
