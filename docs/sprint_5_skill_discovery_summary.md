# Sprint 5 (方向 E) — Skill Discovery 总结

**日期**: 2026-05-12
**方向**: E — Skill Discovery / Self-improving
**状态**: ✅ 已完成

---

## 一句话总结

实现了 session 结束时的自动技能发现功能：Agent 能够从成功的任务执行记录中提取可复用的工作流，自动保存为技能文件，下次启动时自动加载复用。

---

## 实现文件清单

```
src/services/skillDiscovery/
├── prompts/reflect.md              # Reflection prompt 模板
├── types.ts                         # TypeScript 类型定义
├── schema.ts                        # Zod schema 校验
├── reflect.ts                       # 核心 reflection 实现
├── sessionHook.ts                   # Session 结束 hook 集成
└── index.ts                         # 模块导出

src/commands/skills-auto/
├── command.ts                       # /skills-auto 命令实现
└── index.ts                         # 命令导出

修改的文件:
├── src/skills/loadSkillsDir.ts      # 添加 auto/ 目录加载支持
└── src/utils/gracefulShutdown.ts  # 添加 reflection 触发

Demo 脚本:
└── scripts/demo_sprint5_skill_discovery.sh
```

---

## 核心功能

### 1. Transcript 分析 (`sessionHook.ts`)
- 从 session storage 加载 transcript（支持多种格式）
- 解析为结构化条目（tool_call / tool_result / user_message / assistant_message）
- 支持 JSONL 和 JSON 两种格式

### 2. LLM Reflection (`reflect.ts`)
- 使用 prompt 模板让 LLM 识别可复用工作流
- 输出结构化 JSON 包含技能元数据
- 支持 mock 模式（当 LLM 不可用时使用启发式检测）
- Zod schema 校验确保输出格式正确

### 3. Skill 生成与存储
- 将发现的技能写入 `~/.claude/skills/auto/<name>.md`
- Frontmatter 包含技能元数据（名称、描述、使用时机、允许的工具等）
- 复用 claude-code 已有的 skill markdown 格式

### 4. 归档机制
- 同名 skill 自动归档旧版本到 `auto/_archive/`
- 保留历史版本便于追溯
- 最多保留 `maxArchiveVersions` 个版本

### 5. Auto 加载 (`loadSkillsDir.ts`)
- Skill loader 自动加载 auto/ 目录中的单文件格式技能
- 与其他来源的技能合并，支持覆盖和去重
- 加载顺序：managed → auto → user → project → additional → legacy

### 6. 管理命令 (`/skills-auto`)
- `/skills-auto list` — 列出所有自动发现的技能
- `/skills-auto clear` — 清空所有自动技能
- `/skills-auto info <name>` — 查看特定技能的详细信息

---

## 技术要点

### Reflection Prompt 设计
```markdown
You are reviewing a coding session transcript. Identify 0-3 reusable skills.
A "skill" is a reusable workflow that worked successfully in this session.
Be strict: only extract if the same procedure would help in a similar future task.
```

Prompt 特点：
- **严格过滤**：只提取成功且可复用的工作流
- **明确格式**：要求输出标准 JSON，便于解析
- **证据追踪**：要求列出技能来源的 session 步骤

### Session 结束 Hook 集成
```typescript
// gracefulShutdown.ts
const { reflectSessionFromStorage } = await import(
  '../services/skillDiscovery/sessionHook.js'
)
const reflectionResult = await Promise.race([
  reflectSessionFromStorage(),
  sleep(3000), // 限制 3s 不拖慢退出
])
```

### Skill 文件格式
```markdown
---
name: screenshot-to-tailwind-card
description: Convert a UI screenshot to a Tailwind React card component
when-to-use: User provides a card-like UI screenshot...
allowed-tools:
  - VisionQATool
  - FileWriteTool
  - BashTool
user-invocable: true
discovered: 2026-05-12T10:00:00Z
source: session_abc123
---

# Instructions

1. Use VisionQATool to analyze the screenshot...
```

---

## 使用流程

1. **执行任务**: 用户运行重复性任务（如 3 个 design2code）
2. **退出 session**: 用户运行 `/exit` 或按 Ctrl+C
3. **触发 reflection**: gracefulShutdown 自动调用 reflection
4. **发现技能**: LLM 分析 transcript，识别可复用模式
5. **保存技能**: 写入 `~/.claude/skills/auto/`
6. **下次启动**: Skill loader 自动加载发现的技能
7. **复用技能**: 相似任务自动命中，跳过从头 scaffold

---

## Demo 演示

```bash
./scripts/demo_sprint5_skill_discovery.sh
```

演示流程：
1. 模拟 3 个 design2code 任务执行
2. 生成模拟 transcript
3. 触发 skill discovery
4. 显示发现的技能: `screenshot-to-tailwind-card`
5. 使用 `/skills-auto list` 查看
6. 演示第 4 个任务如何复用该技能

---

## 参考论文

- **VOYAGER**: NVIDIA 2023, Minecraft 自动 skill library
- **A-MEM**: Rutgers 2024, Agentic Memory for LLM Agents
- **Letta** (MemGPT): UC Berkeley 2024, persistent agent

---

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| Reflection 产出垃圾 skill | 严格 prompt + 启发式过滤 + 只提取成功模式 |
| 退出时 reflection 拖慢关闭 | 3s 超时限制 + 异步执行 |
| 同名 skill 冲突 | 自动归档旧版本到 `_archive/` |
| LLM 输出格式错误 | Zod schema 校验 + 重试机制 |

---

## 下一步扩展

1. **Skill 质量评分**: 根据使用频率和成功率评估技能质量
2. **用户审核机制**: 将新发现的技能放入 `_pending/` 等待用户确认
3. **Skill 组合**: 支持将多个相关技能组合为工作流模板
4. **Mem0 集成**: 平滑迁移到 Mem0 多层记忆系统

---

## 验收标准

| Ticket | 验收标准 | 状态 |
|--------|----------|------|
| S5-E1 | reflection prompt + zod schema | ✅ |
| S5-E2 | reflectSession() 实现 | ✅ |
| S5-E3 | session 结束 hook | ✅ |
| S5-E4 | skill loader 加 auto/ 路径 | ✅ |
| S5-E5 | /skills-auto 命令 | ✅ |
| S5-E6 | demo 脚本 | ✅ |
