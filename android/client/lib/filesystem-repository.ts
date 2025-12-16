import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { getApiUrl, apiRequest } from './query-client';

const DATA_DIRECTORY = `${FileSystem.documentDirectory}zeke-data/`;
const SYNC_QUEUE_FILE = `${DATA_DIRECTORY}sync-queue.json`;

export interface SyncMetadata {
  id: string;
  lastModified: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
  version: number;
}

export interface ListData {
  id: string;
  name: string;
  description?: string;
  color?: string;
  type?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListItemData {
  id: string;
  listId: string;
  text: string;
  checked: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface GroceryItemData {
  id: string;
  name: string;
  quantity?: number;
  unit?: string;
  category?: string;
  isPurchased: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SyncQueueItem {
  id: string;
  type: 'list' | 'listItem' | 'grocery';
  action: 'create' | 'update' | 'delete';
  data: any;
  timestamp: string;
  retryCount: number;
}

interface StoredData<T> {
  items: T[];
  metadata: Record<string, SyncMetadata>;
  lastSyncTime?: string;
}

function generateId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

async function ensureDirectoryExists(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  
  const dirInfo = await FileSystem.getInfoAsync(DATA_DIRECTORY);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(DATA_DIRECTORY, { intermediates: true });
  }
}

async function readJsonFile<T>(filename: string, defaultValue: T): Promise<T> {
  if (Platform.OS === 'web') {
    const stored = localStorage.getItem(`zeke-${filename}`);
    return stored ? JSON.parse(stored) : defaultValue;
  }
  
  try {
    await ensureDirectoryExists();
    const filePath = `${DATA_DIRECTORY}${filename}`;
    const fileInfo = await FileSystem.getInfoAsync(filePath);
    
    if (!fileInfo.exists) {
      return defaultValue;
    }
    
    const content = await FileSystem.readAsStringAsync(filePath);
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error reading ${filename}:`, error);
    return defaultValue;
  }
}

async function writeJsonFile<T>(filename: string, data: T): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(`zeke-${filename}`, JSON.stringify(data));
    return;
  }
  
  try {
    await ensureDirectoryExists();
    const filePath = `${DATA_DIRECTORY}${filename}`;
    await FileSystem.writeAsStringAsync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error writing ${filename}:`, error);
    throw error;
  }
}

export class ListsRepository {
  private static LISTS_FILE = 'lists.json';
  private static LIST_ITEMS_FILE = 'list-items.json';
  
  static async getLists(): Promise<ListData[]> {
    const data = await readJsonFile<StoredData<ListData>>(this.LISTS_FILE, { items: [], metadata: {} });
    return data.items;
  }
  
  static async getList(id: string): Promise<ListData | null> {
    const lists = await this.getLists();
    return lists.find(l => l.id === id) || null;
  }
  
  static async getListWithItems(id: string): Promise<(ListData & { items: ListItemData[] }) | null> {
    const list = await this.getList(id);
    if (!list) return null;
    
    const allItems = await this.getListItems();
    const items = allItems.filter(item => item.listId === id).sort((a, b) => a.order - b.order);
    
    return { ...list, items };
  }
  
  static async getListItems(): Promise<ListItemData[]> {
    const data = await readJsonFile<StoredData<ListItemData>>(this.LIST_ITEMS_FILE, { items: [], metadata: {} });
    return data.items;
  }
  
  static async createList(name: string, description?: string, color?: string, type?: string): Promise<ListData> {
    const data = await readJsonFile<StoredData<ListData>>(this.LISTS_FILE, { items: [], metadata: {} });
    
    const now = new Date().toISOString();
    const newList: ListData = {
      id: generateId(),
      name,
      description,
      color,
      type,
      createdAt: now,
      updatedAt: now,
    };
    
    data.items.push(newList);
    data.metadata[newList.id] = {
      id: newList.id,
      lastModified: now,
      syncStatus: 'pending',
      version: 1,
    };
    
    await writeJsonFile(this.LISTS_FILE, data);
    await SyncQueue.add('list', 'create', newList);
    
    return newList;
  }
  
  static async updateList(id: string, updates: Partial<ListData>): Promise<ListData | null> {
    const data = await readJsonFile<StoredData<ListData>>(this.LISTS_FILE, { items: [], metadata: {} });
    
    const index = data.items.findIndex(l => l.id === id);
    if (index === -1) return null;
    
    const now = new Date().toISOString();
    data.items[index] = { ...data.items[index], ...updates, updatedAt: now };
    
    data.metadata[id] = {
      ...data.metadata[id],
      lastModified: now,
      syncStatus: 'pending',
      version: (data.metadata[id]?.version || 0) + 1,
    };
    
    await writeJsonFile(this.LISTS_FILE, data);
    await SyncQueue.add('list', 'update', data.items[index]);
    
    return data.items[index];
  }
  
  static async deleteList(id: string): Promise<void> {
    const data = await readJsonFile<StoredData<ListData>>(this.LISTS_FILE, { items: [], metadata: {} });
    
    data.items = data.items.filter(l => l.id !== id);
    delete data.metadata[id];
    
    await writeJsonFile(this.LISTS_FILE, data);
    
    const itemsData = await readJsonFile<StoredData<ListItemData>>(this.LIST_ITEMS_FILE, { items: [], metadata: {} });
    const deletedItems = itemsData.items.filter(item => item.listId === id);
    itemsData.items = itemsData.items.filter(item => item.listId !== id);
    deletedItems.forEach(item => delete itemsData.metadata[item.id]);
    await writeJsonFile(this.LIST_ITEMS_FILE, itemsData);
    
    await SyncQueue.add('list', 'delete', { id });
  }
  
  static async addListItem(listId: string, text: string): Promise<ListItemData> {
    const data = await readJsonFile<StoredData<ListItemData>>(this.LIST_ITEMS_FILE, { items: [], metadata: {} });
    
    const existingItems = data.items.filter(i => i.listId === listId);
    const maxOrder = existingItems.length > 0 ? Math.max(...existingItems.map(i => i.order)) : 0;
    
    const now = new Date().toISOString();
    const newItem: ListItemData = {
      id: generateId(),
      listId,
      text,
      checked: false,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    };
    
    data.items.push(newItem);
    data.metadata[newItem.id] = {
      id: newItem.id,
      lastModified: now,
      syncStatus: 'pending',
      version: 1,
    };
    
    await writeJsonFile(this.LIST_ITEMS_FILE, data);
    await SyncQueue.add('listItem', 'create', newItem);
    
    return newItem;
  }
  
  static async toggleListItem(listId: string, itemId: string): Promise<ListItemData | null> {
    const data = await readJsonFile<StoredData<ListItemData>>(this.LIST_ITEMS_FILE, { items: [], metadata: {} });
    
    const index = data.items.findIndex(i => i.id === itemId && i.listId === listId);
    if (index === -1) return null;
    
    const now = new Date().toISOString();
    data.items[index] = {
      ...data.items[index],
      checked: !data.items[index].checked,
      updatedAt: now,
    };
    
    data.metadata[itemId] = {
      ...data.metadata[itemId],
      lastModified: now,
      syncStatus: 'pending',
      version: (data.metadata[itemId]?.version || 0) + 1,
    };
    
    await writeJsonFile(this.LIST_ITEMS_FILE, data);
    await SyncQueue.add('listItem', 'update', data.items[index]);
    
    return data.items[index];
  }
  
  static async deleteListItem(listId: string, itemId: string): Promise<void> {
    const data = await readJsonFile<StoredData<ListItemData>>(this.LIST_ITEMS_FILE, { items: [], metadata: {} });
    
    data.items = data.items.filter(i => !(i.id === itemId && i.listId === listId));
    delete data.metadata[itemId];
    
    await writeJsonFile(this.LIST_ITEMS_FILE, data);
    await SyncQueue.add('listItem', 'delete', { id: itemId, listId });
  }
  
  static async clearCheckedItems(listId: string): Promise<void> {
    const data = await readJsonFile<StoredData<ListItemData>>(this.LIST_ITEMS_FILE, { items: [], metadata: {} });
    
    const checkedItems = data.items.filter(i => i.listId === listId && i.checked);
    data.items = data.items.filter(i => !(i.listId === listId && i.checked));
    checkedItems.forEach(item => delete data.metadata[item.id]);
    
    await writeJsonFile(this.LIST_ITEMS_FILE, data);
    
    for (const item of checkedItems) {
      await SyncQueue.add('listItem', 'delete', { id: item.id, listId });
    }
  }
  
  static async getListCount(listId: string): Promise<number> {
    const items = await this.getListItems();
    return items.filter(i => i.listId === listId).length;
  }
  
  static async importFromBackend(lists: any[], listItems: any[]): Promise<void> {
    const listsData: StoredData<ListData> = { items: [], metadata: {} };
    const itemsData: StoredData<ListItemData> = { items: [], metadata: {} };
    
    for (const list of lists) {
      const listData: ListData = {
        id: list.id,
        name: list.name,
        description: list.description,
        color: list.color,
        type: list.type,
        createdAt: list.createdAt || new Date().toISOString(),
        updatedAt: list.updatedAt || new Date().toISOString(),
      };
      listsData.items.push(listData);
      listsData.metadata[list.id] = {
        id: list.id,
        lastModified: listData.updatedAt,
        syncStatus: 'synced',
        version: 1,
      };
    }
    
    for (const item of listItems) {
      const itemData: ListItemData = {
        id: item.id,
        listId: item.listId,
        text: item.text,
        checked: item.checked || false,
        order: item.order || 0,
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || new Date().toISOString(),
      };
      itemsData.items.push(itemData);
      itemsData.metadata[item.id] = {
        id: item.id,
        lastModified: itemData.updatedAt,
        syncStatus: 'synced',
        version: 1,
      };
    }
    
    listsData.lastSyncTime = new Date().toISOString();
    itemsData.lastSyncTime = new Date().toISOString();
    
    await writeJsonFile(this.LISTS_FILE, listsData);
    await writeJsonFile(this.LIST_ITEMS_FILE, itemsData);
  }
}

export class GroceryRepository {
  private static GROCERY_FILE = 'grocery.json';
  
  static async getItems(): Promise<GroceryItemData[]> {
    const data = await readJsonFile<StoredData<GroceryItemData>>(this.GROCERY_FILE, { items: [], metadata: {} });
    return data.items;
  }
  
  static async getItem(id: string): Promise<GroceryItemData | null> {
    const items = await this.getItems();
    return items.find(i => i.id === id) || null;
  }
  
  static async addItem(name: string, quantity?: number, unit?: string, category?: string): Promise<GroceryItemData> {
    const data = await readJsonFile<StoredData<GroceryItemData>>(this.GROCERY_FILE, { items: [], metadata: {} });
    
    const now = new Date().toISOString();
    const newItem: GroceryItemData = {
      id: generateId(),
      name,
      quantity,
      unit,
      category: category || 'Other',
      isPurchased: false,
      createdAt: now,
      updatedAt: now,
    };
    
    data.items.push(newItem);
    data.metadata[newItem.id] = {
      id: newItem.id,
      lastModified: now,
      syncStatus: 'pending',
      version: 1,
    };
    
    await writeJsonFile(this.GROCERY_FILE, data);
    await SyncQueue.add('grocery', 'create', newItem);
    
    return newItem;
  }
  
  static async updateItem(id: string, updates: Partial<GroceryItemData>): Promise<GroceryItemData | null> {
    const data = await readJsonFile<StoredData<GroceryItemData>>(this.GROCERY_FILE, { items: [], metadata: {} });
    
    const index = data.items.findIndex(i => i.id === id);
    if (index === -1) return null;
    
    const now = new Date().toISOString();
    data.items[index] = { ...data.items[index], ...updates, updatedAt: now };
    
    data.metadata[id] = {
      ...data.metadata[id],
      lastModified: now,
      syncStatus: 'pending',
      version: (data.metadata[id]?.version || 0) + 1,
    };
    
    await writeJsonFile(this.GROCERY_FILE, data);
    await SyncQueue.add('grocery', 'update', data.items[index]);
    
    return data.items[index];
  }
  
  static async togglePurchased(id: string): Promise<GroceryItemData | null> {
    const item = await this.getItem(id);
    if (!item) return null;
    
    return this.updateItem(id, { isPurchased: !item.isPurchased });
  }
  
  static async deleteItem(id: string): Promise<void> {
    const data = await readJsonFile<StoredData<GroceryItemData>>(this.GROCERY_FILE, { items: [], metadata: {} });
    
    data.items = data.items.filter(i => i.id !== id);
    delete data.metadata[id];
    
    await writeJsonFile(this.GROCERY_FILE, data);
    await SyncQueue.add('grocery', 'delete', { id });
  }
  
  static async clearPurchased(): Promise<void> {
    const data = await readJsonFile<StoredData<GroceryItemData>>(this.GROCERY_FILE, { items: [], metadata: {} });
    
    const purchasedItems = data.items.filter(i => i.isPurchased);
    data.items = data.items.filter(i => !i.isPurchased);
    purchasedItems.forEach(item => delete data.metadata[item.id]);
    
    await writeJsonFile(this.GROCERY_FILE, data);
    
    for (const item of purchasedItems) {
      await SyncQueue.add('grocery', 'delete', { id: item.id });
    }
  }
  
  static async importFromBackend(items: any[]): Promise<void> {
    const data: StoredData<GroceryItemData> = { items: [], metadata: {}, lastSyncTime: new Date().toISOString() };
    
    for (const item of items) {
      const groceryData: GroceryItemData = {
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category || 'Other',
        isPurchased: item.isPurchased || false,
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || new Date().toISOString(),
      };
      data.items.push(groceryData);
      data.metadata[item.id] = {
        id: item.id,
        lastModified: groceryData.updatedAt,
        syncStatus: 'synced',
        version: 1,
      };
    }
    
    await writeJsonFile(this.GROCERY_FILE, data);
  }
}

export class SyncQueue {
  static async getQueue(): Promise<SyncQueueItem[]> {
    return await readJsonFile<SyncQueueItem[]>('sync-queue.json', []);
  }
  
  static async add(type: SyncQueueItem['type'], action: SyncQueueItem['action'], data: any): Promise<void> {
    const queue = await this.getQueue();
    
    queue.push({
      id: generateId(),
      type,
      action,
      data,
      timestamp: new Date().toISOString(),
      retryCount: 0,
    });
    
    await writeJsonFile('sync-queue.json', queue);
  }
  
  static async remove(id: string): Promise<void> {
    const queue = await this.getQueue();
    const filtered = queue.filter(item => item.id !== id);
    await writeJsonFile('sync-queue.json', filtered);
  }
  
  static async clear(): Promise<void> {
    await writeJsonFile('sync-queue.json', []);
  }
  
  static async getPendingCount(): Promise<number> {
    const queue = await this.getQueue();
    return queue.length;
  }
}

export class SyncService {
  private static isSyncing = false;
  
  static async syncToBackend(): Promise<{ success: boolean; synced: number; errors: string[] }> {
    if (this.isSyncing) {
      return { success: false, synced: 0, errors: ['Sync already in progress'] };
    }
    
    this.isSyncing = true;
    const errors: string[] = [];
    let synced = 0;
    
    try {
      const queue = await SyncQueue.getQueue();
      
      for (const item of queue) {
        try {
          await this.syncItem(item);
          await SyncQueue.remove(item.id);
          synced++;
        } catch (error) {
          errors.push(`Failed to sync ${item.type}: ${error}`);
          if (item.retryCount >= 3) {
            await SyncQueue.remove(item.id);
          }
        }
      }
      
      return { success: errors.length === 0, synced, errors };
    } finally {
      this.isSyncing = false;
    }
  }
  
  private static async syncItem(item: SyncQueueItem): Promise<void> {
    const baseUrl = getApiUrl();
    
    switch (item.type) {
      case 'list':
        await this.syncList(item);
        break;
      case 'listItem':
        await this.syncListItem(item);
        break;
      case 'grocery':
        await this.syncGrocery(item);
        break;
    }
  }
  
  private static async syncList(item: SyncQueueItem): Promise<void> {
    switch (item.action) {
      case 'create':
        await apiRequest('POST', '/api/lists', item.data);
        break;
      case 'update':
        await apiRequest('PATCH', `/api/lists/${item.data.id}`, item.data);
        break;
      case 'delete':
        await apiRequest('DELETE', `/api/lists/${item.data.id}`);
        break;
    }
  }
  
  private static async syncListItem(item: SyncQueueItem): Promise<void> {
    switch (item.action) {
      case 'create':
        await apiRequest('POST', `/api/lists/${item.data.listId}/items`, { text: item.data.text });
        break;
      case 'update':
        await apiRequest('PATCH', `/api/lists/${item.data.listId}/items/${item.data.id}`, item.data);
        break;
      case 'delete':
        await apiRequest('DELETE', `/api/lists/${item.data.listId}/items/${item.data.id}`);
        break;
    }
  }
  
  private static async syncGrocery(item: SyncQueueItem): Promise<void> {
    switch (item.action) {
      case 'create':
        await apiRequest('POST', '/api/grocery', item.data);
        break;
      case 'update':
        await apiRequest('PATCH', `/api/grocery/${item.data.id}`, item.data);
        break;
      case 'delete':
        await apiRequest('DELETE', `/api/grocery/${item.data.id}`);
        break;
    }
  }
  
  static async importFromBackend(): Promise<{ lists: number; grocery: number }> {
    try {
      const [listsRes, groceryRes] = await Promise.all([
        fetch(new URL('/api/lists', getApiUrl()).toString(), { credentials: 'include' }),
        fetch(new URL('/api/grocery', getApiUrl()).toString(), { credentials: 'include' }),
      ]);
      
      let lists: any[] = [];
      let grocery: any[] = [];
      let listItems: any[] = [];
      
      if (listsRes.ok) {
        const listsData = await listsRes.json();
        lists = listsData.lists || listsData || [];
        
        for (const list of lists) {
          const itemsRes = await fetch(
            new URL(`/api/lists/${list.id}`, getApiUrl()).toString(),
            { credentials: 'include' }
          );
          if (itemsRes.ok) {
            const listData = await itemsRes.json();
            if (listData.items) {
              listItems.push(...listData.items.map((item: any) => ({ ...item, listId: list.id })));
            }
          }
        }
      }
      
      if (groceryRes.ok) {
        const groceryData = await groceryRes.json();
        grocery = groceryData.items || groceryData || [];
      }
      
      await ListsRepository.importFromBackend(lists, listItems);
      await GroceryRepository.importFromBackend(grocery);
      
      return { lists: lists.length, grocery: grocery.length };
    } catch (error) {
      console.error('Import from backend failed:', error);
      throw error;
    }
  }
}

export async function getSyncStatus(): Promise<{
  pendingChanges: number;
  lastSyncTime: string | null;
  isOnline: boolean;
}> {
  const pendingCount = await SyncQueue.getPendingCount();
  
  const listsData = await readJsonFile<StoredData<ListData>>('lists.json', { items: [], metadata: {} });
  const groceryData = await readJsonFile<StoredData<GroceryItemData>>('grocery.json', { items: [], metadata: {} });
  
  const lastSyncTime = listsData.lastSyncTime || groceryData.lastSyncTime || null;
  
  return {
    pendingChanges: pendingCount,
    lastSyncTime,
    isOnline: true,
  };
}
