/**
 * LRU（最近最少使用）缓存：最多保留 maxSize 条记录，超出时淘汰最久未访问的。
 * 支持可选 TTL：写入时设置 expiresAt，读取时过期则视为未命中并删除。
 *
 * 用于 Open-Meteo API 响应缓存，避免长期会话内存无限增长。
 */
export class LRUCache<K, V> {
  private map = new Map<K, { value: V; expiresAt: number }>();
  private readonly maxSize: number;
  /** TTL 毫秒；Infinity 表示永不过期（如 archive 历史数据幂等可永久缓存） */
  private readonly defaultTtl: number;

  constructor(maxSize: number, defaultTtl: number = Number.POSITIVE_INFINITY) {
    this.maxSize = maxSize;
    this.defaultTtl = defaultTtl;
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    // 过期判定：expiresAt <= Date.now() 视为过期
    if (entry.expiresAt <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // LRU：重新插入到 Map 末尾（Map 保持插入顺序，末尾为最近访问）
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V, ttl: number = this.defaultTtl): void {
    // 已存在先删除，确保移到末尾
    this.map.delete(key);
    this.map.set(key, { value, expiresAt: Date.now() + ttl });
    // 超容量淘汰最旧（Map 首项）
    while (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  has(key: K): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;
    if (entry.expiresAt <= Date.now()) {
      this.map.delete(key);
      return false;
    }
    return true;
  }

  get size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }
}
