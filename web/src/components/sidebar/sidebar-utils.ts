import type { Collection, History, Request } from '../../types';

export function groupHistoryByDate(history: History[]): { label: string; items: History[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups = new Map<string, History[]>();

  for (const item of history) {
    const date = new Date(item.createdAt);
    const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    let label: string;
    if (itemDate.getTime() === today.getTime()) {
      label = 'Today';
    } else if (itemDate.getTime() === yesterday.getTime()) {
      label = 'Yesterday';
    } else {
      label = itemDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label)!.push(item);
  }

  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

export function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function containsRequest(collection: Collection, requestId: number): boolean {
  if (collection.requests?.some(r => r.id === requestId)) return true;
  if (collection.children?.some(c => containsRequest(c, requestId))) return true;
  return false;
}

export function findCollectionById(collections: Collection[], id: number): Collection | undefined {
  for (const c of collections) {
    if (c.id === id) return c;
    if (c.children) {
      const found = findCollectionById(c.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

export function findCollectionSiblings(collections: Collection[], collectionId: number): { siblings: Collection[]; index: number; parentId: number | undefined } | undefined {
  for (let i = 0; i < collections.length; i++) {
    if (collections[i].id === collectionId) {
      return { siblings: collections, index: i, parentId: collections[i].parentId };
    }
    if (collections[i].children) {
      const found = findCollectionSiblings(collections[i].children!, collectionId);
      if (found) return found;
    }
  }
  return undefined;
}

export function findRequestSiblings(collections: Collection[], requestId: number): { siblings: Request[]; index: number; collectionId: number } | undefined {
  for (const c of collections) {
    if (c.requests) {
      const idx = c.requests.findIndex(r => r.id === requestId);
      if (idx !== -1) return { siblings: c.requests, index: idx, collectionId: c.id };
    }
    if (c.children) {
      const found = findRequestSiblings(c.children, requestId);
      if (found) return found;
    }
  }
  return undefined;
}
