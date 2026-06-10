/**
 * Skill Discovery 类型定义
 *
 * 方向 E: Skill Discovery / Self-improving
 * Sprint: S5-E
 */

/**
 * 发现的技能定义
 */
export interface DiscoveredSkill {
  /** 技能名称 (kebab-case) */
  name: string
  /** 描述 */
  description: string
  /** 何时使用 */
  whenToUse: string
  /** 使用说明 (markdown) */
  instructions: string
  /** 允许使用的工具列表 */
  allowedTools: string[]
  /** 证据 (来自哪些 session 步骤) */
  evidence: string[]
  /** 发现时间戳 */
  discoveredAt?: string
  /** 来源 session ID */
  sourceSessionId?: string
}

/**
 * Reflection 结果
 */
export interface ReflectionResult {
  /** 发现的技能列表 */
  skills: DiscoveredSkill[]
  /** 处理的步骤数量 */
  stepsProcessed: number
  /** LLM 使用的 token 数量 */
  tokensUsed?: {
    input: number
    output: number
  }
  /** 延迟 (毫秒) */
  latencyMs: number
}

/**
 * Session 记录条目
 */
export interface SessionTranscriptEntry {
  /** 步骤类型 */
  type: 'tool_call' | 'tool_result' | 'user_message' | 'assistant_message'
  /** 时间戳 */
  timestamp: number
  /** 工具名称 (如果是 tool 相关) */
  toolName?: string
  /** 内容摘要 */
  content: string
  /** 完整内容 (可选) */
  fullContent?: string
}

/**
 * Skill 存储配置
 */
export interface SkillStorageConfig {
  /** 自动技能目录 */
  autoSkillsDir: string
  /** 归档目录 */
  archiveDir: string
  /** 待审核目录 */
  pendingDir: string
  /** 最大归档版本数 */
  maxArchiveVersions: number
}

/**
 * 技能冲突解决策略
 */
export type ConflictResolution = 'overwrite' | 'archive' | 'skip'

/**
 * 技能发现配置
 */
export interface SkillDiscoveryConfig {
  /** 是否启用 */
  enabled: boolean
  /** 触发方式 */
  trigger: 'exit' | 'manual' | 'both'
  /** 最小 session 步骤数才触发 reflection */
  minStepsForReflection: number
  /** 冲突解决策略 */
  conflictResolution: ConflictResolution
  /** 存储配置 */
  storage: SkillStorageConfig
}
