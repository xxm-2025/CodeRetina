/**
 * Vision Router Budgets —— 预算控制
 *
 * 功能：
 * - 每会话视觉查询预算追踪
 * - 预算警告与强制降级
 * - 成本预估
 * - 与 cost-tracker.ts 集成
 *
 * Sprint: S1-4
 */

import type { BudgetConfig, VisionModelTier } from '../types.js'

/**
 * 成本记录
 */
interface CostRecord {
  timestamp: number
  tier: VisionModelTier
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  operation: string
}

/**
 * 预算状态
 */
interface BudgetStatus {
  totalSpent: number
  budgetLimit: number
  remaining: number
  percentage: number
  warning: boolean
  forceDowngrade: boolean
}

/**
 * 模型定价（每 1K tokens）
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Tier 1: 本地模型（电费等成本，近似估算）
  moondream2: { input: 0.0001, output: 0.0001 },
  'minicpm-v-2.6': { input: 0.0002, output: 0.0002 },

  // Tier 2: 云端便宜
  'claude-haiku': { input: 0.25, output: 1.25 },
  'gemini-flash': { input: 0.075, output: 0.3 },

  // Tier 3: 云端 SOTA
  'claude-sonnet': { input: 3.0, output: 15.0 },
  'claude-opus': { input: 15.0, output: 75.0 },
  'gemini-pro': { input: 1.25, output: 5.0 },
}

/**
 * 预算管理器
 */
export class BudgetManager {
  private config: BudgetConfig
  private records: CostRecord[] = []
  private sessionStartTime: number

  constructor(config?: Partial<BudgetConfig>) {
    this.config = {
      maxBudgetUsd: 0.5,
      visionBudgetRatio: 0.3,
      warningThreshold: 0.8,
      forceDowngradeThreshold: 0.95,
      ...config,
    }

    this.sessionStartTime = Date.now()
  }

  /**
   * 记录成本
   */
  recordCost(
    model: string,
    tier: VisionModelTier,
    inputTokens: number,
    outputTokens: number,
    operation = 'vision_query'
  ): number {
    const pricing = MODEL_PRICING[model] ?? { input: 0.001, output: 0.001 }

    const inputCost = (inputTokens / 1000) * pricing.input
    const outputCost = (outputTokens / 1000) * pricing.output
    const totalCost = inputCost + outputCost

    const record: CostRecord = {
      timestamp: Date.now(),
      tier,
      model,
      inputTokens,
      outputTokens,
      costUsd: totalCost,
      operation,
    }

    this.records.push(record)
    return totalCost
  }

  /**
   * 估算成本
   */
  estimateCost(model: string, estimatedInputTokens: number, estimatedOutputTokens: number): number {
    const pricing = MODEL_PRICING[model] ?? { input: 0.001, output: 0.001 }

    const inputCost = (estimatedInputTokens / 1000) * pricing.input
    const outputCost = (estimatedOutputTokens / 1000) * pricing.output

    return inputCost + outputCost
  }

  /**
   * 获取当前预算状态
   */
  getStatus(): BudgetStatus {
    const visionBudget = this.config.maxBudgetUsd * this.config.visionBudgetRatio
    const totalSpent = this.getTotalSpent()
    const percentage = totalSpent / visionBudget

    return {
      totalSpent,
      budgetLimit: visionBudget,
      remaining: Math.max(0, visionBudget - totalSpent),
      percentage,
      warning: percentage >= this.config.warningThreshold,
      forceDowngrade: percentage >= this.config.forceDowngradeThreshold,
    }
  }

  /**
   * 检查是否超出预算
   */
  isOverBudget(): boolean {
    const status = this.getStatus()
    return status.totalSpent >= status.budgetLimit
  }

  /**
   * 检查是否需要警告
   */
  shouldWarn(): boolean {
    return this.getStatus().warning
  }

  /**
   * 检查是否强制降级
   */
  shouldForceDowngrade(): boolean {
    return this.getStatus().forceDowngrade
  }

  /**
   * 获取建议的 tier（基于预算）
   */
  getRecommendedTier(): VisionModelTier {
    const status = this.getStatus()

    if (status.forceDowngrade) {
      return 'tier1'
    }

    if (status.warning) {
      return 'tier2'
    }

    return 'tier3'
  }

  /**
   * 获取总花费
   */
  getTotalSpent(): number {
    return this.records.reduce((sum, r) => sum + r.costUsd, 0)
  }

  /**
   * 获取 tier 分布统计
   */
  getTierBreakdown(): Record<VisionModelTier, { count: number; cost: number }> {
    const breakdown: Record<VisionModelTier, { count: number; cost: number }> = {
      tier1: { count: 0, cost: 0 },
      tier2: { count: 0, cost: 0 },
      tier3: { count: 0, cost: 0 },
    }

    for (const record of this.records) {
      breakdown[record.tier].count++
      breakdown[record.tier].cost += record.costUsd
    }

    return breakdown
  }

  /**
   * 获取详细报告
   */
  getReport(): {
    sessionDuration: number
    totalQueries: number
    totalCost: number
    budgetLimit: number
    remaining: number
    tierBreakdown: Record<VisionModelTier, { count: number; cost: number }>
    averageCostPerQuery: number
    records: CostRecord[]
  } {
    const totalCost = this.getTotalSpent()
    const visionBudget = this.config.maxBudgetUsd * this.config.visionBudgetRatio

    return {
      sessionDuration: Date.now() - this.sessionStartTime,
      totalQueries: this.records.length,
      totalCost,
      budgetLimit: visionBudget,
      remaining: Math.max(0, visionBudget - totalCost),
      tierBreakdown: this.getTierBreakdown(),
      averageCostPerQuery: this.records.length > 0 ? totalCost / this.records.length : 0,
      records: this.records,
    }
  }

  /**
   * 打印预算报告
   */
  printReport(): void {
    const report = this.getReport()
    const status = this.getStatus()

    console.log('\n=== Vision Budget Report ===')
    console.log(`Session duration: ${(report.sessionDuration / 1000).toFixed(1)}s`)
    console.log(`Total queries: ${report.totalQueries}`)
    console.log(`Total cost: $${report.totalCost.toFixed(4)} / $${report.budgetLimit.toFixed(2)}`)
    console.log(`Remaining: $${report.remaining.toFixed(4)} (${(status.percentage * 100).toFixed(1)}% used)`)

    if (status.warning) {
      console.log('⚠️  WARNING: Approaching budget limit')
    }

    if (status.forceDowngrade) {
      console.log('🔽 FORCE DOWNGRADE: Only Tier 1 allowed')
    }

    console.log('\nTier breakdown:')
    for (const [tier, data] of Object.entries(report.tierBreakdown)) {
      console.log(`  ${tier}: ${data.count} queries, $${data.cost.toFixed(4)}`)
    }

    console.log(`\nAvg cost per query: $${report.averageCostPerQuery.toFixed(4)}`)
    console.log('===========================\n')
  }

  /**
   * 重置预算
   */
  reset(): void {
    this.records = []
    this.sessionStartTime = Date.now()
  }
}

/**
 * 获取模型定价信息
 */
export function getModelPricing(model: string): { input: number; output: number } | null {
  return MODEL_PRICING[model] ?? null
}

/**
 * 列出所有可用模型及其定价
 */
export function listModelPricing(): Array<{
  model: string
  tier: VisionModelTier
  inputPrice: number
  outputPrice: number
}> {
  const tierMap: Record<string, VisionModelTier> = {
    moondream2: 'tier1',
    'minicpm-v-2.6': 'tier1',
    'claude-haiku': 'tier2',
    'gemini-flash': 'tier2',
    'claude-sonnet': 'tier3',
    'claude-opus': 'tier3',
    'gemini-pro': 'tier3',
  }

  return Object.entries(MODEL_PRICING).map(([model, pricing]) => ({
    model,
    tier: tierMap[model] ?? 'tier2',
    inputPrice: pricing.input,
    outputPrice: pricing.output,
  }))
}
