/**
 * Skill Discovery Session Hook
 *
 * 方向 E: Skill Discovery / Self-improving
 * Sprint: S5-E
 *
 * 在 session 结束时调用，从 storage 中读取 transcript 并执行 reflection
 */

import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { getSessionId } from '../../bootstrap/state.js'
import { logForDebugging } from '../../utils/debug.js'
import { reflectSession } from './reflect.js'
import type { SessionTranscriptEntry, ReflectionResult } from './types.js'

/**
 * 从 session storage 获取 transcript 路径
 */
function getSessionStoragePath(): string {
  const sessionId = getSessionId()
  return join(getClaudeConfigHomeDir(), 'sessions', sessionId)
}

/**
 * 从 storage 读取 transcript 文件
 * 优先读取精简版 transcript，如果不存在则尝试完整版
 */
async function loadTranscriptFromStorage(): Promise<SessionTranscriptEntry[]> {
  const sessionPath = getSessionStoragePath()

  // 尝试读取精简版 transcript
  const compactPath = join(sessionPath, 'transcript.jsonl')
  if (existsSync(compactPath)) {
    try {
      const content = await readFile(compactPath, 'utf-8')
      return parseTranscriptJsonl(content)
    } catch (error) {
      logForDebugging(`[skill-discovery] Failed to load compact transcript: ${error}`)
    }
  }

  // 尝试读取完整 transcript
  const fullPath = join(sessionPath, 'full_transcript.jsonl')
  if (existsSync(fullPath)) {
    try {
      const content = await readFile(fullPath, 'utf-8')
      return parseTranscriptJsonl(content)
    } catch (error) {
      logForDebugging(`[skill-discovery] Failed to load full transcript: ${error}`)
    }
  }

  // 尝试读取 message history
  const messagesPath = join(sessionPath, 'messages.json')
  if (existsSync(messagesPath)) {
    try {
      const content = await readFile(messagesPath, 'utf-8')
      return parseMessagesJson(content)
    } catch (error) {
      logForDebugging(`[skill-discovery] Failed to load messages: ${error}`)
    }
  }

  return []
}

/**
 * 解析 JSONL 格式的 transcript
 */
function parseTranscriptJsonl(content: string): SessionTranscriptEntry[] {
  const entries: SessionTranscriptEntry[] = []
  const lines = content.trim().split('\n')

  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const record = JSON.parse(line)
      entries.push({
        type: inferEntryType(record),
        timestamp: record.timestamp || Date.now(),
        toolName: record.tool_name || record.toolName,
        content: record.content || record.text || JSON.stringify(record),
      })
    } catch {
      // 跳过解析失败的行
    }
  }

  return entries
}

/**
 * 解析 messages.json 格式
 */
function parseMessagesJson(content: string): SessionTranscriptEntry[] {
  try {
    const messages = JSON.parse(content)
    if (!Array.isArray(messages)) return []

    return messages.map((msg: Record<string, unknown>, index: number) => ({
      type: inferMessageType(msg),
      timestamp: (msg.timestamp as number) || Date.now() + index,
      toolName: (msg.tool_name as string) || (msg.toolName as string),
      content:
        (msg.content as string) ||
        (msg.text as string) ||
        extractMessageContent(msg),
    }))
  } catch {
    return []
  }
}

/**
 * 从消息对象中提取内容
 */
function extractMessageContent(msg: Record<string, unknown>): string {
  const parts: string[] = []

  if (msg.role) {
    parts.push(`Role: ${msg.role}`)
  }

  if (msg.name) {
    parts.push(`Name: ${msg.name}`)
  }

  if (typeof msg.content === 'string') {
    parts.push(msg.content)
  } else if (Array.isArray(msg.content)) {
    parts.push(JSON.stringify(msg.content).slice(0, 500))
  }

  if (msg.tool_calls) {
    parts.push(`Tool calls: ${JSON.stringify(msg.tool_calls).slice(0, 200)}`)
  }

  if (msg.tool_call_id) {
    parts.push(`Tool call ID: ${msg.tool_call_id}`)
  }

  return parts.join('\n') || JSON.stringify(msg).slice(0, 500)
}

/**
 * 推断 entry 类型
 */
function inferEntryType(record: Record<string, unknown>): SessionTranscriptEntry['type'] {
  if (record.type) {
    const t = String(record.type).toLowerCase()
    if (t.includes('tool') && t.includes('call')) return 'tool_call'
    if (t.includes('tool') && t.includes('result')) return 'tool_result'
    if (t.includes('user')) return 'user_message'
    if (t.includes('assistant')) return 'assistant_message'
  }

  if (record.tool_name || record.toolName) return 'tool_call'
  if (record.tool_call_id) return 'tool_result'
  if (record.role === 'user') return 'user_message'
  if (record.role === 'assistant') return 'assistant_message'

  return 'assistant_message'
}

/**
 * 推断消息类型
 */
function inferMessageType(msg: Record<string, unknown>): SessionTranscriptEntry['type'] {
  if (msg.role === 'user') return 'user_message'
  if (msg.role === 'assistant') return 'assistant_message'
  if (msg.tool_calls) return 'tool_call'
  if (msg.tool_call_id) return 'tool_result'

  return 'assistant_message'
}

/**
 * 从 storage 读取并执行 reflection
 * 这是 session 结束 hook 的主入口
 */
export async function reflectSessionFromStorage(): Promise<ReflectionResult> {
  const startTime = Date.now()

  // 加载 transcript
  const entries = await loadTranscriptFromStorage()

  if (entries.length === 0) {
    logForDebugging('[skill-discovery] No transcript entries found, skipping reflection')
    return {
      skills: [],
      stepsProcessed: 0,
      latencyMs: Date.now() - startTime,
    }
  }

  logForDebugging(`[skill-discovery] Loaded ${entries.length} transcript entries`)

  // 执行 reflection
  return reflectSession(entries, {
    minSteps: 3,
    useLLM: true,
  })
}

/**
 * 检查是否启用了 skill discovery
 */
export function isSkillDiscoveryEnabled(): boolean {
  // 可以通过环境变量禁用
  if (process.env.CLAUDE_CODE_DISABLE_SKILL_DISCOVERY === 'true') {
    return false
  }
  return true
}
