# Claude Code Vision 测试套件

针对 PLAN.md 中 Sprint 0-2 的测试，设计目标是**真正能检验出问题**。

## 测试结构

```
tests/
├── README.md                      # 本文件
├── run_tests.py                   # 总测试运行器
├── fixtures/                      # 测试数据
├── sprint0/                       # Sprint 0 测试
│   ├── sidecar_protocol.test.ts   # S0-3: JSON-RPC 协议编解码
│   └── entry.test.ts              # S0-4: Entry Point 配置验证
├── sprint1/                       # Sprint 1 测试
│   ├── sidecar.test.ts            # S1-1: Sidecar 进程管理
│   ├── python_sidecar_test.py     # S1-2/3: Python VLM/Detect
│   ├── router.test.ts             # S1-4: Hybrid Vision Router
│   └── vision_tools.test.ts       # S1-5: VisionQATool/OCRTool/AnnotateTool
└── sprint2/                       # Sprint 2 测试
    ├── screenshot_tool.test.ts    # S2-1: 截图工具
    ├── browser_vision_tool.test.ts # S2-2: Playwright 浏览器工具
    └── image_diff_tool.test.ts    # S2-3: 图像对比工具
```

## 运行测试

### 全部测试

```bash
python tests/run_tests.py
```

### 单独运行某个测试

```bash
# TypeScript 测试（需要 bun 或 tsx）
bun tests/sprint1/router.test.ts

# Python 测试
python tests/sprint1/python_sidecar_test.py
```

## 测试设计原则

每个测试都针对实际可能出现的 Bug：

### Sprint 0 能检验的问题

| 测试 | 能发现的 Bug |
|------|-------------|
| `sidecar_protocol.test.ts` | Content-Length 按字符数而非字节数计算、中文编码错误、消息粘包解析失败 |
| `entry.test.ts` | QueryEngine 配置缺失、Tool 加载不完整、状态管理错误 |

### Sprint 1 能检验的问题

| 测试 | 能发现的 Bug |
|------|-------------|
| `sidecar.test.ts` | 进程启动失败未捕获、超时机制失效、无限重启、资源泄漏 |
| `python_sidecar_test.py` | VLM 模型加载失败、图像解码错误、RPC 响应格式错误 |
| `router.test.ts` | 路由决策错误、缓存键冲突、预算超限检测失效、置信度升级逻辑错误 |
| `vision_tools.test.ts` | 参数验证不完整、Schema 定义错误、工具元数据缺失 |

### Sprint 2 能检验的问题

| 测试 | 能发现的 Bug |
|------|-------------|
| `screenshot_tool.test.ts` | 平台检测错误、截图命令构造错误、特殊字符未转义 |
| `browser_vision_tool.test.ts` | Playwright 未安装时崩溃、URL 未验证导致 XSS 风险、浏览器未正确关闭 |
| `image_diff_tool.test.ts` | 尺寸不匹配处理错误、依赖缺失时回退失效、相似度计算错误 |

## 测试覆盖的关键边界情况

### 协议层
- UTF-8 多字节字符（中文、Emoji）的 Content-Length 计算
- LSP 消息粘包（多条消息一次性到达）
- 部分消息（数据不足）等待更多数据

### 进程管理
- 进程启动失败（Python 路径错误、脚本不存在）
- 超过最大重启次数限制
- 意外退出时的自动重启

### 路由逻辑
- 预算超限强制降级到 Tier 1
- 低置信度自动升级到更高 Tier
- 用户指定 preferredTier 优先

### 缓存系统
- 基于图像内容哈希（而非路径）的缓存键
- TTL 过期清理
- LRU 淘汰机制

### 图像处理
- 不同尺寸图像的统一处理
- 依赖缺失时的降级策略
- 大图像的内存管理

### 浏览器控制
- JavaScript 协议（XSS）防护
- 浏览器实例清理（防止僵尸进程）
- 超时处理

## 添加新测试

创建新的测试文件时遵循以下模板：

```typescript
describe('模块名', () => {
  test('具体功能点', () => {
    // 测试代码
  })

  test('边界情况', () => {
    // 边界测试
  })

  test('错误处理', () => {
    // 错误场景
  })
})
```

测试应该：
1. 明确说明能检验什么问题
2. 包含正常路径和异常路径
3. 覆盖边界情况
4. 不依赖外部资源（或优雅降级）
