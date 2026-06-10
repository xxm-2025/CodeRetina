/**
 * Skill Discovery JSON Schema 校验
 *
 * 方向 E: Skill Discovery / Self-improving
 * Sprint: S5-E
 */

import { z } from 'zod'

/**
 * 发现的技能 Schema
 */
export const DiscoveredSkillSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9-]+$/, '技能名必须是 kebab-case 格式')
    .min(1, '技能名不能为空')
    .max(64, '技能名太长'),
  description: z.string().min(10, '描述太短').max(500, '描述太长'),
  when_to_use: z.string().min(10, '使用时机描述太短').max(1000, '使用时机描述太长'),
  instructions: z.string().min(20, '说明太短').max(5000, '说明太长'),
  allowed_tools: z.array(z.string()).min(1, '至少需要一个工具'),
  evidence: z.array(z.string()).optional().default([]),
})

/**
 * Reflection 输出 Schema
 */
export const ReflectionOutputSchema = z.array(DiscoveredSkillSchema)

/**
 * 校验 LLM 输出
 * @param data 待校验的数据
 * @returns 校验结果
 */
export function validateReflectionOutput(
  data: unknown,
): { success: true; skills: z.infer<typeof ReflectionOutputSchema> } | { success: false; error: string } {
  const result = ReflectionOutputSchema.safeParse(data)

  if (result.success) {
    return { success: true, skills: result.data }
  } else {
    const errorMessages = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
    return { success: false, error: errorMessages.join('; ') }
  }
}

/**
 * 清理和标准化技能名称
 * @param name 原始名称
 * @returns 标准化的 kebab-case 名称
 */
export function normalizeSkillName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // 非字母数字替换为 -
    .replace(/^-+|-+$/g, '') // 移除首尾 -
    .replace(/-+/g, '-') // 连续的 - 合并
}

/**
 * 将校验后的技能转换为标准格式
 * @param raw 原始技能数据
 * @param sessionId 来源 session ID
 * @returns 标准化的技能
 */
export function normalizeDiscoveredSkill(
  raw: z.infer<typeof DiscoveredSkillSchema>,
  sessionId: string,
): {
  name: string
  description: string
  whenToUse: string
  instructions: string
  allowedTools: string[]
  evidence: string[]
  discoveredAt: string
  sourceSessionId: string
} {
  return {
    name: normalizeSkillName(raw.name),
    description: raw.description,
    whenToUse: raw.when_to_use,
    instructions: raw.instructions,
    allowedTools: raw.allowed_tools,
    evidence: raw.evidence || [],
    discoveredAt: new Date().toISOString(),
    sourceSessionId: sessionId,
  }
}
