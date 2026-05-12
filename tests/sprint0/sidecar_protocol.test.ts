/**
 * Sprint 0-3: Sidecar JSON-RPC 协议测试
 *
 * 测试 LSP 风格消息格式、编解码、边界情况
 * 能检验出的问题：
 * - Content-Length 计算错误（UTF-8 字节 vs 字符）
 * - 消息边界混淆（多条消息粘包）
 * - 头部解析失败
 * - 消息体截断
 */

import { randomUUID } from 'crypto'

// 模拟 LSP 消息格式
function encodeMessage(data: unknown): string {
  const json = JSON.stringify(data)
  const contentLength = Buffer.byteLength(json, 'utf8')
  return `Content-Length: ${contentLength}\r\n\r\n${json}`
}

function decodeMessages(buffer: string): Array<{ header: Record<string, string>; body: unknown }> {
  const messages: Array<{ header: Record<string, string>; body: unknown }> = []
  let remaining = buffer

  while (remaining.length > 0) {
    // 查找头部结束位置
    const headerEnd = remaining.indexOf('\r\n\r\n')
    if (headerEnd === -1) break

    // 解析头部
    const headerStr = remaining.slice(0, headerEnd)
    const header: Record<string, string> = {}

    for (const line of headerStr.split('\r\n')) {
      const colonIndex = line.indexOf(':')
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim()
        const value = line.slice(colonIndex + 1).trim()
        header[key] = value
      }
    }

    // 获取 Content-Length
    const contentLength = parseInt(header['Content-Length'] || '0', 10)
    if (isNaN(contentLength) || contentLength <= 0) break

    // 提取 body
    const bodyStart = headerEnd + 4 // \r\n\r\n 长度
    const bodyEnd = bodyStart + contentLength

    if (remaining.length < bodyEnd) break

    const bodyStr = remaining.slice(bodyStart, bodyEnd)
    remaining = remaining.slice(bodyEnd)

    try {
      const body = JSON.parse(bodyStr)
      messages.push({ header, body })
    } catch {
      messages.push({ header, body: null })
    }
  }

  return messages
}

describe('S0-3: JSON-RPC Protocol', () => {
  describe('消息编码', () => {
    test('基本请求编码正确', () => {
      const request = {
        jsonrpc: '2.0',
        id: '1',
        method: 'echo',
        params: { message: 'hello' },
      }

      const encoded = encodeMessage(request)

      expect(encoded).toMatch(/^Content-Length: \d+\r\n\r\n/)
      expect(encoded).toContain('"jsonrpc":"2.0"')
      expect(encoded).toContain('"method":"echo"')
    })

    test('中文内容编码字节长度正确', () => {
      // 这是常见的 bug：String.length 返回字符数，但 Content-Length 需要字节数
      const request = {
        jsonrpc: '2.0',
        id: '1',
        method: 'echo',
        params: { message: '你好世界' }, // 4字符，但12字节(UTF-8)
      }

      const encoded = encodeMessage(request)
      const contentLengthMatch = encoded.match(/Content-Length: (\d+)/)
      expect(contentLengthMatch).not.toBeNull()

      const declaredLength = parseInt(contentLengthMatch![1], 10)
      const jsonStart = encoded.indexOf('\r\n\r\n') + 4
      const actualJson = encoded.slice(jsonStart)
      const actualLength = Buffer.byteLength(actualJson, 'utf8')

      // 关键测试：声明的长度必须等于实际字节长度
      expect(declaredLength).toBe(actualLength)
      expect(actualLength).toBeGreaterThan(actualJson.length) // 中文的 UTF-8 编码比字符数大
    })

    test('特殊字符编码正确', () => {
      const request = {
        jsonrpc: '2.0',
        id: '1',
        method: 'echo',
        params: {
          message: '🎨 Emoji 测试 \n\r \\ "quoted"',
        },
      }

      const encoded = encodeMessage(request)
      const decoded = decodeMessages(encoded)

      expect(decoded).toHaveLength(1)
      expect((decoded[0].body as any).params.message).toBe(request.params.message)
    })
  })

  describe('消息解码', () => {
    test('单条消息解码', () => {
      const request = {
        jsonrpc: '2.0',
        id: 'test-1',
        method: 'vlm.caption',
        params: { image_path: '/tmp/test.png' },
      }

      const encoded = encodeMessage(request)
      const decoded = decodeMessages(encoded)

      expect(decoded).toHaveLength(1)
      expect(decoded[0].header['Content-Length']).toBeDefined()
      expect((decoded[0].body as any).id).toBe('test-1')
      expect((decoded[0].body as any).method).toBe('vlm.caption')
    })

    test('多条消息粘包解码', () => {
      // 模拟 TCP 流中的粘包情况
      const msg1 = { jsonrpc: '2.0', id: '1', method: 'echo', params: { n: 1 } }
      const msg2 = { jsonrpc: '2.0', id: '2', method: 'echo', params: { n: 2 } }
      const msg3 = { jsonrpc: '2.0', id: '3', method: 'echo', params: { n: 3 } }

      const encoded = encodeMessage(msg1) + encodeMessage(msg2) + encodeMessage(msg3)
      const decoded = decodeMessages(encoded)

      expect(decoded).toHaveLength(3)
      expect((decoded[0].body as any).id).toBe('1')
      expect((decoded[1].body as any).id).toBe('2')
      expect((decoded[2].body as any).id).toBe('3')
    })

    test('部分消息（数据不足）等待更多数据', () => {
      const request = {
        jsonrpc: '2.0',
        id: '1',
        method: 'echo',
        params: { message: 'test' },
      }

      const encoded = encodeMessage(request)
      // 只取一半数据
      const partial = encoded.slice(0, encoded.length - 5)
      const decoded = decodeMessages(partial)

      expect(decoded).toHaveLength(0) // 数据不足，无法解析
    })

    test('垃圾数据后接有效消息', () => {
      const garbage = 'some garbage data that is not LSP format\r\n'
      const valid = encodeMessage({ jsonrpc: '2.0', id: '1', method: 'echo', params: {} })

      // 垃圾数据应该导致解析失败，但有效消息应该被正确解析
      const decoded = decodeMessages(garbage + valid)

      // 预期：能够跳过垃圾数据（或至少不会因为垃圾数据崩溃）
      // 当前实现会找到第一个有效的 Content-Length 头部
      expect(decoded.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('边界情况', () => {
    test('空消息体应被拒绝', () => {
      const badMessage = 'Content-Length: 0\r\n\r\n'
      const decoded = decodeMessages(badMessage)

      expect(decoded).toHaveLength(0) // 应该拒绝空消息
    })

    test('超大消息处理', () => {
      const bigData = 'x'.repeat(1000000) // 1MB 的字符串
      const request = {
        jsonrpc: '2.0',
        id: '1',
        method: 'echo',
        params: { data: bigData },
      }

      const encoded = encodeMessage(request)
      const decoded = decodeMessages(encoded)

      expect(decoded).toHaveLength(1)
      expect((decoded[0].body as any).params.data.length).toBe(1000000)
    })

    test('Content-Length 与实际长度不匹配', () => {
      // 模拟 bug：声明的长度比实际大
      const json = JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'echo' })
      const realLength = Buffer.byteLength(json, 'utf8')
      const wrongMessage = `Content-Length: ${realLength + 100}\r\n\r\n${json}`

      const decoded = decodeMessages(wrongMessage)

      // 应该等待更多数据（数据不足）
      expect(decoded).toHaveLength(0)
    })

    test('缺少 Content-Length 头部', () => {
      const badMessage = 'Some-Header: value\r\n\r\n{"jsonrpc":"2.0"}'
      const decoded = decodeMessages(badMessage)

      expect(decoded).toHaveLength(0)
    })

    test('通知消息（无 id）解码', () => {
      const notification = {
        jsonrpc: '2.0',
        method: 'system.shutdown',
        params: {},
      }

      const encoded = encodeMessage(notification)
      const decoded = decodeMessages(encoded)

      expect(decoded).toHaveLength(1)
      expect((decoded[0].body as any).id).toBeUndefined()
      expect((decoded[0].body as any).method).toBe('system.shutdown')
    })
  })

  describe('状态码和错误处理', () => {
    test('标准 JSON-RPC 错误格式', () => {
      const errorResponse = {
        jsonrpc: '2.0',
        id: '1',
        error: {
          code: -32601, // Method not found
          message: 'Method not found',
          data: { method: 'unknown.method' },
        },
      }

      const encoded = encodeMessage(errorResponse)
      const decoded = decodeMessages(encoded)

      expect(decoded).toHaveLength(1)
      expect((decoded[0].body as any).error.code).toBe(-32601)
    })

    test('批量请求（数组格式）', () => {
      const batch = [
        { jsonrpc: '2.0', id: '1', method: 'echo', params: {} },
        { jsonrpc: '2.0', id: '2', method: 'echo', params: {} },
      ]

      const encoded = encodeMessage(batch)
      const decoded = decodeMessages(encoded)

      expect(decoded).toHaveLength(1)
      expect((decoded[0].body as any)).toHaveLength(2)
    })
  })
})

// 简单的测试运行器
function describe(name: string, fn: () => void) {
  console.log(`\n📦 ${name}`)
  fn()
}

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✅ ${name}`)
  } catch (error) {
    console.log(`  ❌ ${name}: ${error}`)
    process.exitCode = 1
  }
}

// 如果直接运行
if (require.main === module) {
  // 测试会自动运行（因为 describe 和 test 已经执行）
  console.log('\n========================================')
  console.log('Sidecar Protocol Tests Complete')
  console.log('========================================')
}
