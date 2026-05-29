import type { Collection } from '../api/collections';
import type { Request } from '../api/requests';
import type { Flow } from '../api/flows';
import type { ErdDocument } from '../api/erds';
import type { ErdCollection } from '../api/erdCollections';
import type { History } from '../api/history';

export function matchesQuery(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase());
}

export function filterCollectionTree(
  collections: Collection[],
  query: string,
): { collections: Collection[]; expandedIds: Set<number> } {
  const expandedIds = new Set<number>();

  function filterCollection(col: Collection): Collection | null {
    const filteredChildren = (col.children ?? [])
      .map(filterCollection)
      .filter((c): c is Collection => c !== null);

    const filteredRequests = (col.requests ?? []).filter(
      (r) => matchesQuery(r.name, query) || matchesQuery(r.url, query),
    );

    const nameMatches = matchesQuery(col.name, query);

    if (nameMatches || filteredRequests.length > 0 || filteredChildren.length > 0) {
      expandedIds.add(col.id);
      return {
        ...col,
        children: filteredChildren.length > 0 ? filteredChildren : nameMatches ? col.children : [],
        requests: filteredRequests.length > 0 ? filteredRequests : nameMatches ? col.requests : [],
      };
    }

    return null;
  }

  const filtered = collections
    .map(filterCollection)
    .filter((c): c is Collection => c !== null);

  return { collections: filtered, expandedIds };
}

export function filterFlows(flows: Flow[], query: string): Flow[] {
  return flows.filter(
    (f) => matchesQuery(f.name, query) || matchesQuery(f.description, query),
  );
}

export function filterErds(erds: ErdDocument[], query: string): ErdDocument[] {
  return erds.filter(
    (erd) => matchesQuery(erd.name, query) || matchesQuery(erd.dsl, query),
  );
}

export function filterErdCollectionTree(
  collections: ErdCollection[],
  query: string,
): { collections: ErdCollection[]; expandedIds: Set<number> } {
  const expandedIds = new Set<number>();

  function filterCollection(collection: ErdCollection): ErdCollection | null {
    const filteredChildren = (collection.children ?? [])
      .map(filterCollection)
      .filter((item): item is ErdCollection => item !== null);
    const filteredErds = (collection.erds ?? []).filter(
      (erd) => matchesQuery(erd.name, query) || matchesQuery(erd.dsl, query),
    );
    const nameMatches = matchesQuery(collection.name, query);

    if (nameMatches || filteredChildren.length > 0 || filteredErds.length > 0) {
      expandedIds.add(collection.id);
      return {
        ...collection,
        children: filteredChildren.length > 0 ? filteredChildren : nameMatches ? collection.children : [],
        erds: filteredErds.length > 0 ? filteredErds : nameMatches ? collection.erds : [],
      };
    }

    return null;
  }

  return {
    collections: collections
      .map(filterCollection)
      .filter((item): item is ErdCollection => item !== null),
    expandedIds,
  };
}

export function filterHistory(history: History[], query: string): History[] {
  return history.filter(
    (h) => matchesQuery(h.method, query) || matchesQuery(h.url, query),
  );
}

export interface FlatRequest {
  request: Request;
  collectionPath: string;
}

export function flattenRequests(collections: Collection[], parentPath = ''): FlatRequest[] {
  const result: FlatRequest[] = [];
  for (const col of collections) {
    const path = parentPath ? `${parentPath} / ${col.name}` : col.name;
    for (const req of col.requests ?? []) {
      result.push({ request: req, collectionPath: path });
    }
    if (col.children) {
      result.push(...flattenRequests(col.children, path));
    }
  }
  return result;
}
