/**
 * Skill Discovery 模块入口
 *
 * 方向 E: Skill Discovery / Self-improving
 * Sprint: S5-E
 */

export {
  reflectSession,
  listDiscoveredSkills,
  getAutoSkillsDir,
  clearAutoSkills,
} from './reflect.js'

export {
  DiscoveredSkillSchema,
  ReflectionOutputSchema,
  validateReflectionOutput,
  normalizeSkillName,
  normalizeDiscoveredSkill,
} from './schema.js'

export type {
  DiscoveredSkill,
  ReflectionResult,
  SessionTranscriptEntry,
  SkillStorageConfig,
  ConflictResolution,
  SkillDiscoveryConfig,
} from './types.js'
