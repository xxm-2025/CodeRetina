/**
 * Vision Router Cache —— 图像+prompt 缓存
 *
 * 功能：
 * - 基于图像哈希 + prompt 的响应缓存
 * - TTL 过期清理
 * - LRU 淘汰
 * - 可选持久化到磁盘
 *
 * Sprint: S1-4
 */

import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join, resolve } from 'path'
import type { CacheConfig, VisionRequest, VisionResponse } from '../types.js'

/**
 * 缓存项
 */
interface CacheEntry {
  key: string
  response: VisionResponse
  timestamp: number
  accessCount: number
  lastAccessed: number
}

/**
 * 持久化缓存数据
 */
interface PersistentCache {
  version: string
  entries: CacheEntry[]
}

const CACHE_VERSION = '1.0'

/**
 * Vision 响应缓存
 */
export class VisionCache {
  private config: CacheConfig
  private memory = new Map<string, CacheEntry>()
  private persistentFile?: string

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      cacheDir: '~/.claude/vision_cache',
      defaultTtlSeconds: 86400, // 24h
      maxSizeMb: 100,
      persistent: true,
      ...config,
    }

    // 解析缓存目录路径
    const cacheDir = this.config.cacheDir.replace(
      /^~/,
      require('os').homedir()
    )

    if (this.config.persistent) {
      this.persistentFile = join(cacheDir, 'cache.json')
      this.loadPersistent()
    }

    // 启动定期清理
    this.startCleanup()
  }

  /**
   * 生成缓存键
   *
   * 基于图像文件内容哈希 + prompt 文本
   */
  generateKey(request: VisionRequest): string {
    try {
      // 读取图像文件计算哈希
      const imageBuffer = readFileSync(request.imagePath)
      const imageHash = createHash('sha256').update(imageBuffer).digest('hex')

      // 组合 prompt 哈希
      const promptHash = createHash('sha256')
        .update(request.prompt)
        .digest('hex')
        .slice(0, 16)

      return `${imageHash.slice(0, 16)}_${promptHash}`
    } catch {
      // 如果读取失败，回退到路径哈希
      const pathHash = createHash('sha256')
        .update(request.imagePath)
        .digest('hex')
        .slice(0, 16)

      const promptHash = createHash('sha256')
        .update(request.prompt)
        .digest('hex')
        .slice(0, 16)

      return `${pathHash}_${promptHash}`
    }
  }

  /**
   * 获取缓存
   */
  get(request: VisionRequest): VisionResponse | null {
    const key = this.generateKey(request)
    const entry = this.memory.get(key)

    if (!entry) {
      return null
    }

    // 检查是否过期
    const now = Date.now()
    const ttlMs = this.config.defaultTtlSeconds * 1000

    if (now - entry.timestamp > ttlMs) {
      this.memory.delete(key)
      return null
    }

    // 更新访问统计
    entry.accessCount++
    entry.lastAccessed = now

    return entry.response
  }

  /**
   * 设置缓存
   */
  set(request: VisionRequest, response: VisionResponse): void {
    const key = this.generateKey(request)
    const now = Date.now()

    const entry: CacheEntry = {
      key,
      response,
      timestamp: now,
      accessCount: 1,
      lastAccessed: now,
    }

    this.memory.set(key, entry)

    // 检查大小限制，执行 LRU 淘汰
    this.enforceSizeLimit()
  }

  /**
   * 检查是否存在
   */
  has(request: VisionRequest): boolean {
    return this.get(request) !== null
  }

  /**
   * 删除缓存
   */
  delete(request: VisionRequest): boolean {
    const key = this.generateKey(request)
    return this.memory.delete(key)
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.memory.clear()
  }

  /**
   * 获取缓存统计
   */
  getStats(): {
    entryCount: number
    estimatedSizeBytes: number
    hitRate: number
    missRate: number
  } {
    // 估算大小（简单估算）
    let estimatedSizeBytes = 0
    for (const entry of this.memory.values()) {
      estimatedSizeBytes += JSON.stringify(entry).length * 2 // UTF-16
    }

    return {
      entryCount: this.memory.size,
      estimatedSizeBytes,
      hitRate: 0, // 需要外部统计
      missRate: 0,
    }
  }

  /**
   * 执行 LRU 淘汰
   */
  private enforceSizeLimit(): void {
    const maxBytes = this.config.maxSizeMb * 1024 * 1024

    let currentBytes = 0
    for (const entry of this.memory.values()) {
      currentBytes += JSON.stringify(entry).length * 2
    }

    if (currentBytes <= maxBytes) {
      return
    }

    // 按最后访问时间排序，淘汰最旧的
    const entries = Array.from(this.memory.values()).sort(
      (a, b) => a.lastAccessed - b.lastAccessed
    )

    let bytesToFree = currentBytes - maxBytes * 0.8 // 释放到 80%

    for (const entry of entries) {
      if (bytesToFree <= 0) {
        break
      }

      const entrySize = JSON.stringify(entry).length * 2
      this.memory.delete(entry.key)
      bytesToFree -= entrySize
    }
  }

  /**
   * 加载持久化缓存
   */
  private loadPersistent(): void {
    if (!this.persistentFile || !existsSync(this.persistentFile)) {
      return
    }

    try {
      const data = JSON.parse(readFileSync(this.persistentFile, 'utf-8')) as PersistentCache

      if (data.version !== CACHE_VERSION) {
        console.warn(`Cache version mismatch: ${data.version} vs ${CACHE_VERSION}`)
        return
      }

      // 过滤过期条目
      const now = Date.now()
      const ttlMs = this.config.defaultTtlSeconds * 1000

      for (const entry of data.entries) {
        if (now - entry.timestamp <= ttlMs) {
          this.memory.set(entry.key, entry)
        }
      }

      console.log(`Loaded ${this.memory.size} cache entries from disk`)
    } catch (error) {
      console.warn('Failed to load persistent cache:', error)
    }
  }

  /**
   * 保存持久化缓存
   */
  savePersistent(): void {
    if (!this.persistentFile) {
      return
    }

    try {
      // 确保目录存在
      const dir = resolve(this.persistentFile, '..')
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }

      const data: PersistentCache = {
        version: CACHE_VERSION,
        entries: Array.from(this.memory.values()),
      }

      writeFileSync(this.persistentFile, JSON.stringify(data, null, 2))
    } catch (error) {
      console.warn('Failed to save persistent cache:', error)
    }
  }

  /**
   * 启动定期清理
   */
  private startCleanup(): void {
    // 每小时清理一次过期条目
    setInterval(() => {
      this.cleanupExpired()
    }, 3600000)

    // 退出时保存
    process.on('exit', () => {
      this.savePersistent()
    })

    process.on('SIGINT', () => {
      this.savePersistent()
      process.exit(0)
    })
  }

  /**
   * 清理过期条目
   */
  private cleanupExpired(): void {
    const now = Date.now()
    const ttlMs = this.config.defaultTtlSeconds * 1000
    let cleaned = 0

    for (const [key, entry] of this.memory.entries()) {
      if (now - entry.timestamp > ttlMs) {
        this.memory.delete(key)
        cleaned++
      }
    }

    if (cleaned > 0) {
      console.log(`Cleaned ${cleaned} expired cache entries`)
    }
  }
}
