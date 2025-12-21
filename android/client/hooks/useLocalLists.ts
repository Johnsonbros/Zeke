import { useState, useEffect, useCallback } from "react";
import {
  ListsRepository,
  SyncService,
  getSyncStatus,
  type ListData,
  type ListItemData,
} from "@/lib/filesystem-repository";

export interface ListWithItems extends ListData {
  items: ListItemData[];
  itemCount: number;
}

export function useLocalLists() {
  const [lists, setLists] = useState<ListData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLists = useCallback(async () => {
    try {
      const data = await ListsRepository.getLists();
      const listsWithCounts = await Promise.all(
        data.map(async (list) => {
          const count = await ListsRepository.getListCount(list.id);
          return { ...list, itemCount: count };
        }),
      );
      setLists(listsWithCounts);
      setError(null);
    } catch (err) {
      setError("Failed to load lists");
      console.error("Error loading lists:", err);
    }
  }, []);

  const refetch = useCallback(async () => {
    setIsRefetching(true);
    await loadLists();
    setIsRefetching(false);
  }, [loadLists]);

  useEffect(() => {
    setIsLoading(true);
    loadLists().finally(() => setIsLoading(false));
  }, [loadLists]);

  const createList = useCallback(
    async (name: string, description?: string, color?: string) => {
      try {
        const newList = await ListsRepository.createList(
          name,
          description,
          color,
        );
        await refetch();
        return newList;
      } catch (err) {
        throw err;
      }
    },
    [refetch],
  );

  const deleteList = useCallback(
    async (id: string) => {
      try {
        await ListsRepository.deleteList(id);
        await refetch();
      } catch (err) {
        throw err;
      }
    },
    [refetch],
  );

  const getListWithItems = useCallback(
    async (id: string): Promise<ListWithItems | null> => {
      try {
        const listWithItems = await ListsRepository.getListWithItems(id);
        if (!listWithItems) return null;
        return {
          ...listWithItems,
          itemCount: listWithItems.items.length,
        };
      } catch (err) {
        console.error("Error getting list with items:", err);
        return null;
      }
    },
    [],
  );

  const addListItem = useCallback(
    async (listId: string, text: string) => {
      try {
        const newItem = await ListsRepository.addListItem(listId, text);
        await refetch();
        return newItem;
      } catch (err) {
        throw err;
      }
    },
    [refetch],
  );

  const toggleListItem = useCallback(
    async (listId: string, itemId: string) => {
      try {
        await ListsRepository.toggleListItem(listId, itemId);
        await refetch();
      } catch (err) {
        throw err;
      }
    },
    [refetch],
  );

  const deleteListItem = useCallback(
    async (listId: string, itemId: string) => {
      try {
        await ListsRepository.deleteListItem(listId, itemId);
        await refetch();
      } catch (err) {
        throw err;
      }
    },
    [refetch],
  );

  const clearCheckedItems = useCallback(
    async (listId: string) => {
      try {
        await ListsRepository.clearCheckedItems(listId);
        await refetch();
      } catch (err) {
        throw err;
      }
    },
    [refetch],
  );

  return {
    lists,
    isLoading,
    isRefetching,
    error,
    refetch,
    createList,
    deleteList,
    getListWithItems,
    addListItem,
    toggleListItem,
    deleteListItem,
    clearCheckedItems,
  };
}

export function useLocalGrocery() {
  const [items, setItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GroceryRepository } = require("@/lib/filesystem-repository");

  const loadItems = useCallback(async () => {
    try {
      const data = await GroceryRepository.getItems();
      setItems(data);
      setError(null);
    } catch (err) {
      setError("Failed to load grocery items");
      console.error("Error loading grocery items:", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refetch = useCallback(async () => {
    setIsRefetching(true);
    await loadItems();
    setIsRefetching(false);
  }, [loadItems]);

  useEffect(() => {
    setIsLoading(true);
    loadItems().finally(() => setIsLoading(false));
  }, [loadItems]);

  const addItem = useCallback(
    async (
      name: string,
      quantity?: number,
      unit?: string,
      category?: string,
    ) => {
      try {
        const newItem = await GroceryRepository.addItem(
          name,
          quantity,
          unit,
          category,
        );
        await refetch();
        return newItem;
      } catch (err) {
        throw err;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refetch],
  );

  const togglePurchased = useCallback(
    async (id: string) => {
      try {
        await GroceryRepository.togglePurchased(id);
        await refetch();
      } catch (err) {
        throw err;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refetch],
  );

  const deleteItem = useCallback(
    async (id: string) => {
      try {
        await GroceryRepository.deleteItem(id);
        await refetch();
      } catch (err) {
        throw err;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refetch],
  );

  const clearPurchased = useCallback(async () => {
    try {
      await GroceryRepository.clearPurchased();
      await refetch();
    } catch (err) {
      throw err;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    items,
    isLoading,
    isRefetching,
    error,
    refetch,
    addItem,
    togglePurchased,
    deleteItem,
    clearPurchased,
  };
}

export function useSyncStatus() {
  const [status, setStatus] = useState<{
    pendingChanges: number;
    lastSyncTime: string | null;
    isOnline: boolean;
    isSyncing: boolean;
  }>({
    pendingChanges: 0,
    lastSyncTime: null,
    isOnline: true,
    isSyncing: false,
  });

  const checkStatus = useCallback(async () => {
    try {
      const syncStatus = await getSyncStatus();
      setStatus((prev) => ({ ...prev, ...syncStatus }));
    } catch (err) {
      console.error("Error checking sync status:", err);
    }
  }, []);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const syncNow = useCallback(async () => {
    setStatus((prev) => ({ ...prev, isSyncing: true }));
    try {
      const result = await SyncService.syncToBackend();
      await checkStatus();
      return result;
    } finally {
      setStatus((prev) => ({ ...prev, isSyncing: false }));
    }
  }, [checkStatus]);

  const importFromBackend = useCallback(async () => {
    setStatus((prev) => ({ ...prev, isSyncing: true }));
    try {
      const result = await SyncService.importFromBackend();
      await checkStatus();
      return result;
    } finally {
      setStatus((prev) => ({ ...prev, isSyncing: false }));
    }
  }, [checkStatus]);

  return {
    ...status,
    checkStatus,
    syncNow,
    importFromBackend,
  };
}
