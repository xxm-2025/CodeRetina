/**
 * Hybrid Vision Router —— 混合视觉路由
 *
 * 根据请求特征自动选择最优视觉模型：
 * - Tier 1: 本地轻量模型 (Moondream, MiniCPM-V)
 * - Tier 2: 云端便宜模型 (Claude Haiku, Gemini Flash)
 * - Tier 3: 云端 SOTA (Claude Sonnet, Gemini Pro)
 *
 * 策略：
 * 1. 规则路由：根据任务类型 + 图像复杂度选择
 * 2. 置信度升级：Tier 1 置信度低时自动升级
 * 3. 预算控制：超限强制降级
 *
 * Sprint: S1-4
 */

import { randomUUID } from 'crypto'
import type {
  AgenticRequest,
  AgenticResult,
  BudgetConfig,
  CacheConfig,
  RoutingDecision,
  RoutingStrategy,
  VisionModelTier,
  VisionRequest,
  VisionResponse,
} from '../types.js'
import { VisionSidecar } from '../sidecar.js'

/**
 * 模型信息
 */
interface ModelInfo {
  id: string
  tier: VisionModelTier
  costPer1KTokens: number
  avgLatencyMs: number
  capabilities: string[]
  maxTokens: number
}

/**
 * 默认模型配置
 */
const DEFAULT_MODELS: ModelInfo[] = [
  // Tier 1: 本地模型
  {
    id: 'moondream2',
    tier: 'tier1',
    costPer1KTokens: 0.0001, // 近似电费等成本
    avgLatencyMs: 500,
    capabilities: ['caption', 'query', 'detect', 'ocr'],
    maxTokens: 512,
  },
  {
    id: 'minicpm-v-2.6',
    tier: 'tier1',
    costPer1KTokens: 0.0002,
    avgLatencyMs: 2000,
    capabilities: ['caption', 'query', 'detect', 'ocr', 'reasoning'],
    maxTokens: 2048,
  },
  // Tier 2: 云端便宜
  {
    id: 'claude-haiku',
    tier: 'tier2',
    costPer1KTokens: 0.25,
    avgLatencyMs: 1000,
    capabilities: ['caption', 'query', 'detect', 'ocr', 'reasoning'],
    maxTokens: 4096,
  },
  {
    id: 'gemini-flash',
    tier: 'tier2',
    costPer1KTokens: 0.15,
    avgLatencyMs: 800,
    capabilities: ['caption', 'query', 'detect', 'ocr', 'reasoning'],
    maxTokens: 8192,
  },
  // Tier 3: 云端 SOTA
  {
    id: 'claude-sonnet',
    tier: 'tier3',
    costPer1KTokens: 3.0,
    avgLatencyMs: 2000,
    capabilities: ['caption', 'query', 'detect', 'ocr', 'reasoning', 'complex'],
    maxTokens: 8192,
  },
  {
    id: 'gemini-pro',
    tier: 'tier3',
    costPer1KTokens: 2.5,
    avgLatencyMs: 1500,
    capabilities: ['caption', 'query', 'detect', 'ocr', 'reasoning', 'complex'],
    maxTokens: 32768,
  },
]

/**
 * 路由配置
 */
export interface RouterConfig {
  /** 默认策略 */
  defaultStrategy: RoutingStrategy
  /** 置信度阈值（低于此值升级） */
  confidenceThreshold: number
  /** 预算配置 */
  budget: BudgetConfig
  /** 缓存配置 */
  cache: CacheConfig
  /** 自定义模型列表 */
  models?: ModelInfo[]
}

/**
 * 路由记录
 */
interface RoutingLog {
  id: string
  timestamp: number
  request: VisionRequest
  decision: RoutingDecision
  response: VisionResponse
  actualCost: number
}

/**
 * Hybrid Vision Router
 */
export class VisionRouter {
  private config: RouterConfig
  private sidecar: VisionSidecar
  private models: Map<string, ModelInfo>
  private sessionCost = 0
  private routingLogs: RoutingLog[] = []
  private cache: Map<string, VisionResponse>

  constructor(sidecar: VisionSidecar, config?: Partial<RouterConfig>) {
    this.sidecar = sidecar
    this.config = {
      defaultStrategy: 'rule-based',
      confidenceThreshold: 0.7,
      budget: {
        maxBudgetUsd: 0.5,
        visionBudgetRatio: 0.3,
        warningThreshold: 0.8,
        forceDowngradeThreshold: 0.95,
      },
      cache: {
        cacheDir: '~/.claude/vision_cache',
        defaultTtlSeconds: 86400, // 24h
        maxSizeMb: 100,
        persistent: true,
      },
      ...config,
    }

    this.models = new Map()
    const modelList = this.config.models ?? DEFAULT_MODELS
    for (const model of modelList) {
      this.models.set(model.id, model)
    }

    this.cache = new Map()
  }

  /**
   * 执行视觉查询（自动路由）
   */
  async query(request: VisionRequest): Promise<VisionResponse> {
    // 1. 检查缓存
    const cacheKey = this.getCacheKey(request)
    const cached = this.cache.get(cacheKey)
    if (cached) {
      return { ...cached, cached: true }
    }

    // 2. 路由决策
    const decision = await this.route(request)

    // 3. 执行查询
    let response: VisionResponse
    let retries = 0
    const maxRetries = 2

    while (true) {
      try {
        response = await this.executeQuery(decision, request)
        break
      } catch (error) {
        retries++
        if (retries > maxRetries) {
          throw error
        }
        // 降级到更低 tier
        const downgraded = this.downgrade(decision)
        if (downgraded.model === decision.model) {
          throw error // 无法降级
        }
        decision.model = downgraded.model
        decision.tier = downgraded.tier
      }
    }

    // 4. 置信度检查与升级
    if (response.confidence < this.config.confidenceThreshold && decision.tier !== 'tier3') {
      const upgraded = this.upgrade(decision)
      if (upgraded.model !== decision.model) {
        const upgradedResponse = await this.executeQuery(upgraded, request)
        if (upgradedResponse.confidence > response.confidence) {
          response = upgradedResponse
        }
      }
    }

    // 5. 记录成本
    this.recordCost(response)

    // 6. 缓存结果
    this.cache.set(cacheKey, response)

    // 7. 记录路由日志
    this.logRouting(request, decision, response)

    return response
  }

  /**
   * 路由决策
   */
  private async route(request: VisionRequest): Promise<RoutingDecision> {
    // 如果用户指定了 tier，优先使用
    if (request.preferredTier) {
      const model = this.getDefaultModelForTier(request.preferredTier)
      return {
        model: model.id,
        tier: model.tier,
        reason: 'User preferred tier',
        estimatedCostUsd: 0,
        estimatedLatencyMs: model.avgLatencyMs,
      }
    }

    // 检查预算，如果接近上限则强制降级
    const budgetLimit = this.config.budget.maxBudgetUsd * this.config.budget.visionBudgetRatio
    if (this.sessionCost >= budgetLimit * this.config.budget.forceDowngradeThreshold) {
      const model = this.getDefaultModelForTier('tier1')
      return {
        model: model.id,
        tier: 'tier1',
        reason: 'Budget limit approaching, force tier 1',
        estimatedCostUsd: 0,
        estimatedLatencyMs: model.avgLatencyMs,
      }
    }

    // 根据任务复杂度选择
    const complexity = this.assessComplexity(request)

    switch (complexity) {
      case 'simple':
        return this.selectModel('tier1', request)
      case 'medium':
        return this.selectModel('tier2', request)
      case 'complex':
        return this.selectModel('tier3', request)
      default:
        return this.selectModel('tier2', request)
    }
  }

  /**
   * 评估任务复杂度
   */
  private assessComplexity(request: VisionRequest): 'simple' | 'medium' | 'complex' {
    const prompt = request.prompt.toLowerCase()

    // 复杂任务关键词
    const complexKeywords = [
      'explain', '分析', 'analyze', 'reasoning', 'compare', 'difference',
      'describe in detail', 'step by step', 'complex',
    ]

    // 简单任务关键词
    const simpleKeywords = ['what is', 'where is', 'find', 'locate', 'caption', 'describe']

    if (complexKeywords.some((kw) => prompt.includes(kw))) {
      return 'complex'
    }

    if (simpleKeywords.some((kw) => prompt.includes(kw))) {
      return 'simple'
    }

    // 默认中等
    return 'medium'
  }

  /**
   * 选择模型
   */
  private selectModel(tier: VisionModelTier, request: VisionRequest): RoutingDecision {
    const model = this.getDefaultModelForTier(tier)

    // 检查模型是否支持所需能力
    const capabilities = this.inferCapabilities(request)
    const supported = capabilities.every((cap) => model.capabilities.includes(cap))

    if (!supported) {
      // 找下一个支持的 tier
      const allTiers: VisionModelTier[] = ['tier1', 'tier2', 'tier3']
      const currentIdx = allTiers.indexOf(tier)
      for (let i = currentIdx + 1; i < allTiers.length; i++) {
        const fallback = this.getDefaultModelForTier(allTiers[i])
        const fallbackSupported = capabilities.every((cap) => fallback.capabilities.includes(cap))
        if (fallbackSupported) {
          return {
            model: fallback.id,
            tier: allTiers[i],
            reason: `Fallback for capability: ${capabilities.join(', ')}`,
            estimatedCostUsd: fallback.costPer1KTokens,
            estimatedLatencyMs: fallback.avgLatencyMs,
          }
        }
      }
    }

    return {
      model: model.id,
      tier,
      reason: `Rule-based selection for ${this.assessComplexity(request)} complexity`,
      estimatedCostUsd: model.costPer1KTokens,
      estimatedLatencyMs: model.avgLatencyMs,
    }
  }

  /**
   * 推断所需能力
   */
  private inferCapabilities(request: VisionRequest): string[] {
    const prompt = request.prompt.toLowerCase()
    const caps: string[] = ['caption']

    if (prompt.includes('text') || prompt.includes('ocr') || prompt.includes('read')) {
      caps.push('ocr')
    }

    if (prompt.includes('find') || prompt.includes('where') || prompt.includes('locate')) {
      caps.push('detect')
    }

    if (
      prompt.includes('why') ||
      prompt.includes('how') ||
      prompt.includes('explain') ||
      prompt.includes('analyze')
    ) {
      caps.push('reasoning')
    }

    return caps
  }

  /**
   * 执行查询
   */
  private async executeQuery(
    decision: RoutingDecision,
    request: VisionRequest
  ): Promise<VisionResponse> {
    const startTime = Date.now()

    // 本地模型通过 sidecar 调用
    if (decision.tier === 'tier1') {
      const result = await this.sidecar.call<{
        text: string
        confidence: number
        latency_ms: number
        tokens?: { input: number; output: number }
      }>('vlm.caption', {
        image_path: request.imagePath,
        model: decision.model,
        prompt: 'describe',
        max_tokens: request.maxTokens ?? 256,
      })

      const latencyMs = Date.now() - startTime

      return {
        text: result.text,
        confidence: result.confidence,
        model: decision.model,
        tier: decision.tier,
        latencyMs: result.latency_ms ?? latencyMs,
        tokens: result.tokens,
      }
    }

    // Tier 2/3: 云端模型（通过 TypeScript 端的 Claude API 调用）
    // 这里简化处理，实际应调用 claude-code 现有的 API 模块
    throw new Error(`Tier ${decision.tier} not yet implemented in router`)
  }

  /**
   * 获取某 tier 的默认模型
   */
  private getDefaultModelForTier(tier: VisionModelTier): ModelInfo {
    for (const model of this.models.values()) {
      if (model.tier === tier) {
        return model
      }
    }
    throw new Error(`No model available for tier: ${tier}`)
  }

  /**
   * 降级模型
   */
  private downgrade(decision: RoutingDecision): RoutingDecision {
    const tiers: VisionModelTier[] = ['tier1', 'tier2', 'tier3']
    const currentIdx = tiers.indexOf(decision.tier)

    if (currentIdx <= 0) {
      return decision // 已是最低 tier
    }

    const newTier = tiers[currentIdx - 1]
    const model = this.getDefaultModelForTier(newTier)

    return {
      model: model.id,
      tier: newTier,
      reason: `Downgrade from ${decision.tier}`,
      estimatedCostUsd: model.costPer1KTokens,
      estimatedLatencyMs: model.avgLatencyMs,
    }
  }

  /**
   * 升级模型
   */
  private upgrade(decision: RoutingDecision): RoutingDecision {
    const tiers: VisionModelTier[] = ['tier1', 'tier2', 'tier3']
    const currentIdx = tiers.indexOf(decision.tier)

    if (currentIdx >= tiers.length - 1) {
      return decision // 已是最高 tier
    }

    const newTier = tiers[currentIdx + 1]
    const model = this.getDefaultModelForTier(newTier)

    return {
      model: model.id,
      tier: newTier,
      reason: `Upgrade from ${decision.tier} (confidence below threshold)`,
      estimatedCostUsd: model.costPer1KTokens,
      estimatedLatencyMs: model.avgLatencyMs,
    }
  }

  /**
   * 计算缓存键
   */
  private getCacheKey(request: VisionRequest): string {
    // 基于图像路径 + prompt 生成缓存键
    const crypto = require('crypto')
    const data = `${request.imagePath}:${request.prompt}:${request.maxTokens ?? 256}`
    return crypto.createHash('sha256').update(data).digest('hex')
  }

  /**
   * 记录成本
   */
  private recordCost(response: VisionResponse): void {
    const model = this.models.get(response.model)
    if (!model || !response.tokens) {
      return
    }

    const tokens = response.tokens.input + response.tokens.output
    const cost = (tokens / 1000) * model.costPer1KTokens
    this.sessionCost += cost
  }

  /**
   * 记录路由日志
   */
  private logRouting(request: VisionRequest, decision: RoutingDecision, response: VisionResponse): void {
    const log: RoutingLog = {
      id: randomUUID(),
      timestamp: Date.now(),
      request,
      decision,
      response,
      actualCost: response.costUsd ?? 0,
    }

    this.routingLogs.push(log)

    // 保留最近 100 条
    if (this.routingLogs.length > 100) {
      this.routingLogs.shift()
    }
  }

  /**
   * 获取当前会话成本
   */
  getSessionCost(): number {
    return this.sessionCost
  }

  /**
   * 获取路由统计
   */
  getStats(): {
    totalQueries: number
    sessionCost: number
    budgetLimit: number
    budgetRemaining: number
    tierDistribution: Record<VisionModelTier, number>
  } {
    const tierDistribution: Record<VisionModelTier, number> = {
      tier1: 0,
      tier2: 0,
      tier3: 0,
    }

    for (const log of this.routingLogs) {
      tierDistribution[log.decision.tier]++
    }

    const budgetLimit = this.config.budget.maxBudgetUsd * this.config.budget.visionBudgetRatio

    return {
      totalQueries: this.routingLogs.length,
      sessionCost: this.sessionCost,
      budgetLimit,
      budgetRemaining: Math.max(0, budgetLimit - this.sessionCost),
      tierDistribution,
    }
  }

  // ============================================================================
  // Agentic Visual Search (Sprint 5 方向 A)
  // ============================================================================

  /**
   * 启发式判断是否需要启用 Agentic 模式
   *
   * 触发关键词：
   * - 小目标/小字: tiny, small text, small font, error code, fine print
   * - 密集UI: dense, crowded, many buttons, complex ui
   * - 精确定位: bottom-right, top-left, corner, specific location
   * - 细节识别: details, zoom in, magnify
   */
  shouldUseAgentic(prompt: string): boolean {
    const promptLower = prompt.toLowerCase()

    const agenticKeywords = [
      // 小字/小目标
      'tiny', 'small text', 'small font', 'fine print', 'micro',
      'error code', 'code:', 'status code',
      // 密集UI
      'dense', 'crowded', 'many buttons', 'complex ui', 'ui element',
      'toolbar', 'menu bar', 'control panel',
      // 精确定位
      'bottom-right', 'bottom right', 'top-left', 'top left',
      'corner', 'specific location', 'exactly where',
      // 细节
      'details', 'zoom in', 'magnify', 'enlarge', 'look closer',
      // 表格/图表
      'table cell', 'chart data', 'specific cell',
    ]

    const shouldTrigger = agenticKeywords.some((kw) => promptLower.includes(kw))

    if (shouldTrigger) {
      console.log(`[Router] Agentic mode triggered by keywords in: "${prompt.substring(0, 50)}..."`)
    }

    return shouldTrigger
  }

  /**
   * 执行 Agentic 视觉查询
   *
   * 通过 crop/zoom/annotate/grid_split 多轮迭代获取答案
   */
  async agenticQuery(request: AgenticRequest): Promise<AgenticResult> {
    const startTime = Date.now()

    // 调用 sidecar 的 vlm.agentic_qa 方法
    const result = await this.sidecar.call<{
      answer: string
      confidence: number
      steps: Array<{
        step: number
        action: string
        rationale: string
        bbox?: number[]
        factor?: number
        grid_size?: number[]
        labels?: string[]
        answer?: string
        image_path?: string
      }>
      trace_images: string[]
      total_latency_ms: number
      model: string
      session_id?: string
      trace_dir?: string
      max_steps_reached?: boolean
    }>('vlm.agentic_qa', {
      image_path: request.imagePath,
      prompt: request.prompt,
      max_steps: request.maxSteps ?? 5,
      base_model: request.baseModel ?? 'moondream2',
    })

    const latencyMs = Date.now() - startTime

    // 转换步骤格式
    const steps = result.steps.map((s) => ({
      step: s.step,
      action: s.action as AgenticResult['steps'][0]['action'],
      rationale: s.rationale,
      bbox: s.bbox,
      factor: s.factor,
      gridSize: s.grid_size,
      labels: s.labels,
      answer: s.answer,
      imagePath: s.image_path,
    }))

    return {
      answer: result.answer,
      confidence: result.confidence,
      steps,
      traceImages: result.trace_images,
      totalLatencyMs: result.total_latency_ms ?? latencyMs,
      model: result.model,
      sessionId: result.session_id,
      traceDir: result.trace_dir,
      maxStepsReached: result.max_steps_reached,
    }
  }
}
