/**
 * 视觉中台共享类型定义
 *
 * Sprint: S1-1
 */

/**
 * 视觉模型层级
 */
export type VisionModelTier = 'tier1' | 'tier2' | 'tier3'

/**
 * 视觉查询请求
 */
export interface VisionRequest {
  /** 图像路径（本地文件路径） */
  imagePath: string
  /** 查询文本 */
  prompt: string
  /** 期望的模型层级（可覆盖路由决策） */
  preferredTier?: VisionModelTier
  /** 最大输出 token */
  maxTokens?: number
  /** 是否需要高精度 */
  requireHighAccuracy?: boolean
}

/**
 * 视觉查询响应
 */
export interface VisionResponse {
  /** 生成的文本 */
  text: string
  /** 置信度 (0-1) */
  confidence: number
  /** 实际使用的模型 */
  model: string
  /** 模型层级 */
  tier: VisionModelTier
  /** 延迟（毫秒） */
  latencyMs: number
  /** Token 消耗 */
  tokens?: {
    input: number
    output: number
  }
  /** 是否从缓存命中 */
  cached?: boolean
  /** 成本估算（美元） */
  costUsd?: number
}

/**
 * 目标检测框
 */
export interface DetectionBox {
  /** 类别标签 */
  label: string
  /** 置信度 */
  confidence: number
  /** 左上角 x */
  x: number
  /** 左上角 y */
  y: number
  /** 宽度 */
  width: number
  /** 高度 */
  height: number
}

/**
 * 检测结果
 */
export interface DetectionResult {
  /** 检测框列表 */
  boxes: DetectionBox[]
  /** 总数 */
  count: number
  /** 使用的模型 */
  model: string
  /** 延迟（毫秒） */
  latencyMs: number
}

/**
 * OCR 文本块
 */
export interface OCRBlock {
  /** 文本内容 */
  text: string
  /** 置信度 */
  confidence: number
  /** 边界框 */
  box?: {
    x: number
    y: number
    width: number
    height: number
  }
}

/**
 * OCR 结果
 */
export interface OCRResult {
  /** 所有文本块 */
  blocks: OCRBlock[]
  /** 合并后的完整文本 */
  fullText: string
  /** 延迟（毫秒） */
  latencyMs: number
}

/**
 * Sidecar RPC 请求
 */
export interface SidecarRequest {
  id: string
  method: string
  params: Record<string, unknown>
}

/**
 * Sidecar RPC 响应
 */
export interface SidecarResponse {
  id: string
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

/**
 * Sidecar 进程配置
 */
export interface SidecarConfig {
  /** Python 解释器路径 */
  pythonPath: string
  /** sidecar 入口脚本路径 */
  scriptPath: string
  /** 启动超时（毫秒） */
  startupTimeoutMs: number
  /** 请求超时（毫秒） */
  requestTimeoutMs: number
  /** 心跳间隔（毫秒） */
  heartbeatIntervalMs: number
  /** 最大重启次数 */
  maxRestarts: number
}

/**
 * 路由策略类型
 */
export type RoutingStrategy = 'rule-based' | 'confidence-threshold' | 'cost-aware'

/**
 * 路由决策
 */
export interface RoutingDecision {
  /** 选定的模型 */
  model: string
  /** 模型层级 */
  tier: VisionModelTier
  /** 决策理由 */
  reason: string
  /** 预估成本 */
  estimatedCostUsd: number
  /** 预估延迟 */
  estimatedLatencyMs: number
}

/**
 * 预算配置
 */
export interface BudgetConfig {
  /** 每会话最大预算（美元） */
  maxBudgetUsd: number
  /** 视觉查询预算比例 */
  visionBudgetRatio: number
  /** 警告阈值（预算的百分比） */
  warningThreshold: number
  /** 强制降级阈值（预算的百分比） */
  forceDowngradeThreshold: number
}

/**
 * 缓存配置
 */
export interface CacheConfig {
  /** 缓存目录 */
  cacheDir: string
  /** 默认 TTL（秒） */
  defaultTtlSeconds: number
  /** 最大缓存大小（MB） */
  maxSizeMb: number
  /** 是否启用持久化 */
  persistent: boolean
}
