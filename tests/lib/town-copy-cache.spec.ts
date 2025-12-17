/**
 * Tests for Town Copy Cache
 * 
 * Run with: npx vitest tests/lib/test_town_copy_cache.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTownCopyCache, type TownCopyData } from '../../lib/cache/townCopy';

describe('TownCopyCache', () => {
  describe('basic operations', () => {
    it('should set and get town copy', async () => {
      const cache = createTownCopyCache();
      const data: TownCopyData = { content: 'Welcome to Boston!', metadata: { region: 'northeast' } };
      
      cache.set('Boston', 'welcome', data);
      const result = await cache.getTownCopy('Boston', 'welcome');
      
      expect(result).toEqual(data);
    });

    it('should normalize keys to lowercase', async () => {
      const cache = createTownCopyCache();
      const data: TownCopyData = { content: 'Hello' };
      
      cache.set('BOSTON', 'WELCOME', data);
      const result = await cache.getTownCopy('boston', 'welcome');
      
      expect(result).toEqual(data);
    });

    it('should return null for missing entries', async () => {
      const cache = createTownCopyCache();
      const result = await cache.getTownCopy('unknown', 'service');
      expect(result).toBeNull();
    });

    it('should report correct has() status', () => {
      const cache = createTownCopyCache();
      
      expect(cache.has('Boston', 'welcome')).toBe(false);
      
      cache.set('Boston', 'welcome', { content: 'Hello' });
      expect(cache.has('Boston', 'welcome')).toBe(true);
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used entries when full', async () => {
      vi.useFakeTimers();
      const cache = createTownCopyCache({ maxSize: 3 });
      
      cache.set('town1', 'service', { content: 'First' });
      vi.advanceTimersByTime(100);
      cache.set('town2', 'service', { content: 'Second' });
      vi.advanceTimersByTime(100);
      cache.set('town3', 'service', { content: 'Third' });
      vi.advanceTimersByTime(100);
      
      // Access town1 to make it recently used
      await cache.getTownCopy('town1', 'service');
      vi.advanceTimersByTime(100);
      
      // Add fourth entry - should evict town2 (least recently used)
      cache.set('town4', 'service', { content: 'Fourth' });
      
      expect(cache.has('town1', 'service')).toBe(true);
      expect(cache.has('town2', 'service')).toBe(false); // Evicted
      expect(cache.has('town3', 'service')).toBe(true);
      expect(cache.has('town4', 'service')).toBe(true);
      
      vi.useRealTimers();
    });

    it('should track eviction stats', () => {
      const cache = createTownCopyCache({ maxSize: 2 });
      
      cache.set('town1', 'service', { content: 'A' });
      cache.set('town2', 'service', { content: 'B' });
      cache.set('town3', 'service', { content: 'C' }); // Triggers eviction
      
      const stats = cache.getStats();
      expect(stats.evictions).toBe(1);
    });

    it('should not evict when updating existing entry at capacity (regression)', async () => {
      const cache = createTownCopyCache({ maxSize: 2 });
      
      cache.set('town1', 'service', { content: 'A' });
      cache.set('town2', 'service', { content: 'B' });
      
      // Update existing entry - should NOT trigger eviction
      cache.set('town1', 'service', { content: 'A updated' });
      
      expect(cache.has('town1', 'service')).toBe(true);
      expect(cache.has('town2', 'service')).toBe(true);
      expect(cache.getStats().evictions).toBe(0);
      
      // Verify updated content
      const result = await cache.getTownCopy('town1', 'service');
      expect(result?.content).toBe('A updated');
    });
  });

  describe('version-based invalidation', () => {
    it('should invalidate specific town/service combination', async () => {
      const cache = createTownCopyCache();
      
      cache.set('Boston', 'welcome', { content: 'Hello Boston' });
      cache.set('Boston', 'pricing', { content: 'Boston pricing' });
      
      cache.invalidate('Boston', 'welcome');
      
      expect(cache.has('Boston', 'welcome')).toBe(false);
      expect(cache.has('Boston', 'pricing')).toBe(true);
    });

    it('should invalidate all services for a town', async () => {
      const cache = createTownCopyCache();
      
      cache.set('Boston', 'welcome', { content: 'Hello' });
      cache.set('Boston', 'pricing', { content: 'Pricing' });
      cache.set('NYC', 'welcome', { content: 'NYC Hello' });
      
      cache.invalidate('Boston'); // Invalidate all Boston entries
      
      expect(cache.has('Boston', 'welcome')).toBe(false);
      expect(cache.has('Boston', 'pricing')).toBe(false);
      expect(cache.has('NYC', 'welcome')).toBe(true);
    });

    it('should invalidate all entries', () => {
      const cache = createTownCopyCache();
      
      cache.set('Boston', 'welcome', { content: 'A' });
      cache.set('NYC', 'pricing', { content: 'B' });
      
      cache.invalidateAll();
      
      expect(cache.has('Boston', 'welcome')).toBe(false);
      expect(cache.has('NYC', 'pricing')).toBe(false);
      expect(cache.getStats().size).toBe(0);
    });

    it('should track invalidation stats', () => {
      const cache = createTownCopyCache();
      
      cache.set('Boston', 'welcome', { content: 'A' });
      cache.invalidate('Boston', 'welcome');
      
      const stats = cache.getStats();
      expect(stats.invalidations).toBe(1);
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', async () => {
      vi.useFakeTimers();
      const cache = createTownCopyCache({ defaultTTLMs: 1000 }); // 1 second TTL
      
      cache.set('Boston', 'welcome', { content: 'Hello' });
      expect(cache.has('Boston', 'welcome')).toBe(true);
      
      // Advance time past TTL
      vi.advanceTimersByTime(1500);
      
      expect(cache.has('Boston', 'welcome')).toBe(false);
      vi.useRealTimers();
    });

    it('should support custom TTL per entry', async () => {
      vi.useFakeTimers();
      const cache = createTownCopyCache({ defaultTTLMs: 10000 });
      
      cache.set('Boston', 'welcome', { content: 'Short lived' }, 500);
      cache.set('NYC', 'welcome', { content: 'Long lived' }); // Uses default
      
      vi.advanceTimersByTime(700);
      
      expect(cache.has('Boston', 'welcome')).toBe(false);
      expect(cache.has('NYC', 'welcome')).toBe(true);
      
      vi.useRealTimers();
    });
  });

  describe('content loader', () => {
    it('should call loader on cache miss', async () => {
      const cache = createTownCopyCache();
      const mockLoader = vi.fn().mockResolvedValue({ content: 'Loaded content' });
      
      cache.setLoader(mockLoader);
      
      const result = await cache.getTownCopy('Boston', 'welcome');
      
      expect(mockLoader).toHaveBeenCalledWith('Boston', 'welcome');
      expect(result?.content).toBe('Loaded content');
    });

    it('should not call loader on cache hit', async () => {
      const cache = createTownCopyCache();
      const mockLoader = vi.fn().mockResolvedValue({ content: 'From loader' });
      
      cache.setLoader(mockLoader);
      cache.set('Boston', 'welcome', { content: 'Cached' });
      
      const result = await cache.getTownCopy('Boston', 'welcome');
      
      expect(mockLoader).not.toHaveBeenCalled();
      expect(result?.content).toBe('Cached');
    });

    it('should cache loaded content', async () => {
      const cache = createTownCopyCache();
      const mockLoader = vi.fn().mockResolvedValue({ content: 'Loaded' });
      
      cache.setLoader(mockLoader);
      
      await cache.getTownCopy('Boston', 'welcome');
      await cache.getTownCopy('Boston', 'welcome');
      
      expect(mockLoader).toHaveBeenCalledTimes(1); // Only called once
    });

    it('should handle loader errors gracefully', async () => {
      const cache = createTownCopyCache();
      const mockLoader = vi.fn().mockRejectedValue(new Error('Load failed'));
      
      cache.setLoader(mockLoader);
      
      const result = await cache.getTownCopy('Boston', 'welcome');
      
      expect(result).toBeNull();
    });

    it('should handle loader returning null', async () => {
      const cache = createTownCopyCache();
      const mockLoader = vi.fn().mockResolvedValue(null);
      
      cache.setLoader(mockLoader);
      
      const result = await cache.getTownCopy('Boston', 'welcome');
      
      expect(result).toBeNull();
    });
  });

  describe('statistics', () => {
    it('should track hits and misses', async () => {
      const cache = createTownCopyCache();
      
      cache.set('Boston', 'welcome', { content: 'Hello' });
      
      await cache.getTownCopy('Boston', 'welcome'); // Hit
      await cache.getTownCopy('Boston', 'welcome'); // Hit
      await cache.getTownCopy('NYC', 'unknown'); // Miss
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.667, 2);
    });

    it('should report cache size', () => {
      const cache = createTownCopyCache();
      
      cache.set('town1', 'service', { content: 'A' });
      cache.set('town2', 'service', { content: 'B' });
      
      expect(cache.getStats().size).toBe(2);
    });
  });

  describe('entries()', () => {
    it('should list all valid entries', () => {
      const cache = createTownCopyCache();
      
      cache.set('Boston', 'welcome', { content: 'A' });
      cache.set('NYC', 'pricing', { content: 'B' });
      
      const entries = cache.entries();
      
      expect(entries).toHaveLength(2);
      expect(entries.map(e => e.key)).toContain('boston:welcome');
      expect(entries.map(e => e.key)).toContain('nyc:pricing');
    });

    it('should exclude expired entries', () => {
      vi.useFakeTimers();
      const cache = createTownCopyCache({ defaultTTLMs: 1000 });
      
      cache.set('Boston', 'welcome', { content: 'A' });
      
      vi.advanceTimersByTime(1500);
      
      const entries = cache.entries();
      expect(entries).toHaveLength(0);
      
      vi.useRealTimers();
    });
  });
});
