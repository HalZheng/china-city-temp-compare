import { describe, expect, it, vi, afterEach } from 'vitest';
import { LRUCache } from './lru-cache';

afterEach(() => vi.useRealTimers());

describe('LRUCache', () => {
  it('evicts least recently used when exceeding maxSize', () => {
    const cache = new LRUCache<string, number>(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    // 访问 a，使 b 成为最旧
    cache.get('a');
    cache.set('d', 4); // 应淘汰 b
    expect(cache.has('b')).toBe(false);
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
    expect(cache.size).toBe(3);
  });

  it('returns undefined for missing keys', () => {
    const cache = new LRUCache<string, number>(5);
    expect(cache.get('x')).toBeUndefined();
    expect(cache.has('x')).toBe(false);
  });

  it('respects TTL and evicts expired entries on get', () => {
    vi.useFakeTimers();
    const cache = new LRUCache<string, number>(5, 1000);
    cache.set('k', 1);
    expect(cache.get('k')).toBe(1);
    vi.advanceTimersByTime(1001);
    expect(cache.get('k')).toBeUndefined();
    expect(cache.has('k')).toBe(false);
  });

  it('supports per-set TTL override', () => {
    vi.useFakeTimers();
    const cache = new LRUCache<string, number>(5); // 默认永久
    cache.set('perm', 1);
    cache.set('temp', 2, 500);
    vi.advanceTimersByTime(501);
    expect(cache.get('perm')).toBe(1);
    expect(cache.get('temp')).toBeUndefined();
  });

  it('does not cache empty results in geocoding scenario', () => {
    // 模拟 searchCities 不缓存空 results 的逻辑
    const cache = new LRUCache<string, { results?: unknown[] }>(50, 3600000);
    const emptyResult = { results: [] };
    const fullResult = { results: [{ name: '北京' }] };
    // 空结果不写入
    if (emptyResult.results && emptyResult.results.length > 0) cache.set('empty', emptyResult);
    cache.set('full', fullResult);
    expect(cache.has('empty')).toBe(false);
    expect(cache.get('full')).toEqual(fullResult);
  });

  it('updating existing key moves it to most-recently-used', () => {
    const cache = new LRUCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 10); // 更新 a，应移到末尾
    cache.set('c', 3); // 应淘汰 b（最旧）
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(10);
    expect(cache.get('c')).toBe(3);
  });
});
