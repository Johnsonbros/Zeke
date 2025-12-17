/**
 * Cache Utilities
 * 
 * Central export for all caching functionality.
 */

export {
  townCopyCache,
  getTownCopy,
  setTownCopy,
  invalidateTownCopy,
  setTownCopyLoader,
  getTownCopyStats,
  createTownCopyCache,
  type TownCopyConfig,
  type TownCopyData,
} from './townCopy';
