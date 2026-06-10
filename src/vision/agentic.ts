/**
 * Agentic Visual Search —— CLI 渲染辅助
 *
 * 提供 trace 步骤树的可视化渲染
 * Sprint: S5-A5
 */

import type { AgenticResult, AgenticStep } from './types.js'

/**
 * 格式化 Agentic 结果为终端友好的字符串
 *
 * 包含：
 * - 步骤树（带缩进和图标）
 * - 动作类型图标
 * - 颜色编码（如果终端支持）
 */
export function renderAgenticTrace(result: AgenticResult, options?: { colors?: boolean }): string {
  const useColors = options?.colors ?? true

  const lines: string[] = []

  // 头部
  lines.push('')
  lines.push('╔══════════════════════════════════════════════════════════╗')
  lines.push('║     🔍 Agentic Visual Search — 执行过程                   ║')
  lines.push('╚══════════════════════════════════════════════════════════╝')
  lines.push('')

  // 最终答案高亮显示
  lines.push('┌─────────────────────────────────────────────────────────┐')
  lines.push(`│  📋 答案: ${truncate(result.answer, 45)}`)
  lines.push('└─────────────────────────────────────────────────────────┘')
  lines.push('')

  // 步骤树
  lines.push('📍 执行步骤:')
  lines.push('')

  for (let i = 0; i < result.steps.length; i++) {
    const step = result.steps[i]
    const isLast = i === result.steps.length - 1

    const line = renderStep(step, i, isLast, useColors)
    lines.push(line)

    // 步骤详细信息（缩进）
    const details = renderStepDetails(step, useColors)
    if (details) {
      lines.push(details)
    }

    lines.push('')
  }

  // 底部统计
  lines.push('─'.repeat(50))
  lines.push(`📊 统计: 共 ${result.steps.length} 步 | 置信度 ${(result.confidence * 100).toFixed(1)}% | 耗时 ${result.totalLatencyMs}ms`)

  if (result.maxStepsReached) {
    lines.push('⚠️  注意: 达到最大步数限制，可能未获得完整答案')
  }

  if (result.traceDir) {
    lines.push(`📁 Trace 目录: ${result.traceDir}`)
  }

  lines.push('')

  return lines.join('\n')
}

/**
 * 渲染单个步骤
 */
function renderStep(step: AgenticStep, index: number, isLast: boolean, colors: boolean): string {
  const icons: Record<string, string> = {
    crop: '✂️',
    zoom: '🔎',
    annotate: '🏷️',
    grid_split: '⊞',
    answer: '✓',
    error: '✗',
  }

  const icon = icons[step.action] || '•'
  const stepNum = String(step.step + 1).padStart(2, '0')
  const actionLabel = step.action.toUpperCase().padEnd(12)

  // 树形连接符
  const connector = isLast ? '└──' : '├──'

  return `${connector} Step ${stepNum} ${icon}  [${actionLabel}]`
}

/**
 * 渲染步骤详细信息
 */
function renderStepDetails(step: AgenticStep, colors: boolean): string | null {
  const details: string[] = []
  const indent = '    '

  // 推理说明
  if (step.rationale) {
    const truncated = truncate(step.rationale, 60)
    details.push(`${indent}💭 ${truncated}`)
  }

  // 动作特定详情
  switch (step.action) {
    case 'crop':
      if (step.bbox) {
        details.push(`${indent}   裁剪区域: [${step.bbox.join(', ')}]`)
      }
      break

    case 'zoom':
      if (step.factor) {
        details.push(`${indent}   缩放倍数: ${step.factor}x`)
      }
      break

    case 'grid_split':
      if (step.gridSize) {
        details.push(`${indent}   网格大小: ${step.gridSize[0]}×${step.gridSize[1]}`)
      }
      if (step.labels) {
        details.push(`${indent}   区域标签: ${step.labels.slice(0, 6).join(', ')}${step.labels.length > 6 ? '...' : ''}`)
      }
      break

    case 'annotate':
      if (step.bbox) {
        details.push(`${indent}   标注位置: [${step.bbox.join(', ')}]`)
      }
      if (step.labels) {
        details.push(`${indent}   标签: ${step.labels.join(', ')}`)
      }
      break

    case 'answer':
      if (step.answer) {
        details.push(`${indent}   📝 ${truncate(step.answer, 50)}`)
      }
      break
  }

  // 图像路径
  if (step.imagePath) {
    const filename = step.imagePath.split('/').pop()
    details.push(`${indent}   📷 ${filename}`)
  }

  return details.length > 0 ? details.join('\n') : null
}

/**
 * 截断字符串
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.substring(0, maxLen - 3) + '...'
}

/**
 * 生成 Agentic 结果的简要单行摘要
 */
export function summarizeAgenticResult(result: AgenticResult): string {
  const steps = result.steps.length
  const conf = (result.confidence * 100).toFixed(0)
  const time = result.totalLatencyMs
  const answer = truncate(result.answer, 30)

  return `🔍 Agentic搜索: ${steps}步/${conf}%置信度/${time}ms → "${answer}"`
}

/**
 * 比较两个 Agentic 结果（用于消融对比）
 */
export function compareAgenticResults(
  withAgentic: AgenticResult,
  withoutAgentic: { answer: string; confidence: number },
): string {
  const lines: string[] = []

  lines.push('')
  lines.push('═══════════════════════════════════════════════════')
  lines.push('         Agentic Visual Search — 对比结果')
  lines.push('═══════════════════════════════════════════════════')
  lines.push('')

  lines.push('┌─────────────────┬─────────────────┬─────────────────┐')
  lines.push('│     指标        │   启用 Agentic   │   禁用 Agentic   │')
  lines.push('├─────────────────┼─────────────────┼─────────────────┤')
  lines.push(`│ 答案            │ ${pad(truncate(withAgentic.answer, 15), 15)} │ ${pad(truncate(withoutAgentic.answer, 15), 15)} │`)
  lines.push(`│ 置信度          │ ${pad((withAgentic.confidence * 100).toFixed(1) + '%', 15)} │ ${pad((withoutAgentic.confidence * 100).toFixed(1) + '%', 15)} │`)
  lines.push(`│ 步数/延迟       │ ${pad(`${withAgentic.steps.length}步/${withAgentic.totalLatencyMs}ms`, 15)} │ ${pad('-', 15)} │`)
  lines.push('└─────────────────┴─────────────────┴─────────────────┘')

  // 判定改进
  const confidenceDiff = withAgentic.confidence - withoutAgentic.confidence
  if (confidenceDiff > 0.1) {
    lines.push('')
    lines.push(`✅ 置信度提升: +${(confidenceDiff * 100).toFixed(1)} 百分点`)
  } else if (confidenceDiff < -0.1) {
    lines.push('')
    lines.push(`⚠️  置信度下降: ${(confidenceDiff * 100).toFixed(1)} 百分点`)
  }

  lines.push('')

  return lines.join('\n')
}

/**
 * 辅助：字符串定宽填充
 */
function pad(str: string, len: number): string {
  if (str.length >= len) return str
  return str + ' '.repeat(len - str.length)
}
