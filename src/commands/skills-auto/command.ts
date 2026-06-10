/**
 * /skills-auto Command —— 查看自动发现的技能
 *
 * 方向 E: Skill Discovery / Self-improving
 * Sprint: S5-E5
 *
 * 用法:
 *   /skills-auto list     列出所有自动发现的技能
 *   /skills-auto clear    清空所有自动发现的技能
 *   /skills-auto info <name>  查看特定技能的详细信息
 */

import type { Command } from '../../commands.js'
import type { Message } from '../../types/message.js'
import {
  listDiscoveredSkills,
  clearAutoSkills,
  getAutoSkillsDir,
} from '../../services/skillDiscovery/index.js'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

export const SkillsAutoCommand: Command = {
  name: 'skills-auto',
  description: 'List and manage auto-discovered skills from session reflection',

  async *execute(
    args: string[],
    _context: {
      submitMessage: (message: Message) => AsyncGenerator<Message, void, unknown>
    }
  ): AsyncGenerator<Message, void, unknown> {
    const subcommand = args[0] || 'list'

    // =====================================================================
    // /skills-auto list
    // =====================================================================
    if (subcommand === 'list') {
      const skills = await listDiscoveredSkills()

      if (skills.length === 0) {
        yield {
          type: 'assistant',
          message: {
            content: [{
              type: 'text',
              text: `🤖 Auto-discovered Skills

暂无自动发现的技能。

技能会在 session 结束时自动从成功的任务中提取。
尝试运行一些重复性的任务（如 /design2code），然后退出 session，系统会自动识别可复用的工作流并创建技能。

技能存储位置: ${getAutoSkillsDir()}
`,
            }],
          },
          uuid: crypto.randomUUID(),
          toolUse: [],
        }
        return
      }

      const lines: string[] = [
        `🤖 Auto-discovered Skills (${skills.length} found)`,
        '',
        '名称 | 描述 | 发现时间',
        '--- | --- | ---',
      ]

      for (const skill of skills) {
        const discoveredAt = skill.discoveredAt
          ? new Date(skill.discoveredAt).toLocaleDateString()
          : 'unknown'
        lines.push(`${skill.name} | ${skill.description.slice(0, 60)}${skill.description.length > 60 ? '...' : ''} | ${discoveredAt}`)
      }

      lines.push('')
      lines.push('使用方法:')
      lines.push('  /skills-auto info <name>  查看技能详情')
      lines.push('  /skills-auto clear        清空所有自动技能')
      lines.push('')
      lines.push(`存储位置: ${getAutoSkillsDir()}`)

      yield {
        type: 'assistant',
        message: {
          content: [{
            type: 'text',
            text: lines.join('\n'),
          }],
        },
        uuid: crypto.randomUUID(),
        toolUse: [],
      }
      return
    }

    // =====================================================================
    // /skills-auto clear
    // =====================================================================
    if (subcommand === 'clear') {
      await clearAutoSkills()

      yield {
        type: 'assistant',
        message: {
          content: [{
            type: 'text',
            text: `🗑️ 已清空所有自动发现的技能\n\n存储位置: ${getAutoSkillsDir()}`,
          }],
        },
        uuid: crypto.randomUUID(),
        toolUse: [],
      }
      return
    }

    // =====================================================================
    // /skills-auto info <name>
    // =====================================================================
    if (subcommand === 'info') {
      const skillName = args[1]
      if (!skillName) {
        yield {
          type: 'assistant',
          message: {
            content: [{
              type: 'text',
              text: '❌ 请提供技能名称: /skills-auto info <name>',
            }],
          },
          uuid: crypto.randomUUID(),
          toolUse: [],
        }
        return
      }

      const skillPath = join(getAutoSkillsDir(), `${skillName}.md`)

      if (!existsSync(skillPath)) {
        yield {
          type: 'assistant',
          message: {
            content: [{
              type: 'text',
              text: `❌ 技能 "${skillName}" 不存在\n\n使用 "/skills-auto list" 查看可用技能`,
            }],
          },
          uuid: crypto.randomUUID(),
          toolUse: [],
        }
        return
      }

      try {
        const content = await readFile(skillPath, 'utf-8')

        yield {
          type: 'assistant',
          message: {
            content: [{
              type: 'text',
              text: `📄 ${skillName}

\`\`\`markdown
${content}
\`\`\``,
            }],
          },
          uuid: crypto.randomUUID(),
          toolUse: [],
        }
      } catch (error) {
        yield {
          type: 'assistant',
          message: {
            content: [{
              type: 'text',
              text: `❌ 无法读取技能文件: ${error}`,
            }],
          },
          uuid: crypto.randomUUID(),
          toolUse: [],
        }
      }
      return
    }

    // =====================================================================
    // 帮助信息
    // =====================================================================
    yield {
      type: 'assistant',
      message: {
        content: [{
          type: 'text',
          text: `🤖 Auto-discovered Skills —— 查看自动发现的技能

用法:
  /skills-auto list           列出所有自动发现的技能
  /skills-auto clear          清空所有自动发现的技能
  /skills-auto info <name>    查看特定技能的详细信息

说明:
  技能发现 (Skill Discovery) 会在 session 结束时分析执行记录，
  自动提取可复用的工作流并保存为技能。

  这些技能位于 ${getAutoSkillsDir()}，
  下次启动时会自动加载，可直接像普通技能一样使用。

示例:
  /skills-auto list           查看已发现的技能
  /skills-auto info screenshot-to-tailwind-card  查看详情`,
        }],
      },
      uuid: crypto.randomUUID(),
      toolUse: [],
    }
  },
}
