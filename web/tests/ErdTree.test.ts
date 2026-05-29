import { describe, expect, test } from 'bun:test';
import type { ErdCollection } from '../src/api/erdCollections';
import { filterErdCollectionTree } from '../src/utils/searchUtils';

const erdCollections: ErdCollection[] = [
  {
    id: 1,
    name: 'Versions',
    sortOrder: 1,
    erds: [],
    children: [
      {
        id: 2,
        name: 'v1',
        parentId: 1,
        sortOrder: 1,
        erds: [
          {
            id: 10,
            collectionId: 2,
            name: 'Commerce Snapshot',
            dsl: '{"entities":[]}',
            sortOrder: 1,
            createdAt: '',
            updatedAt: '',
          },
        ],
        children: [],
        createdAt: '',
        updatedAt: '',
      },
    ],
    createdAt: '',
    updatedAt: '',
  },
];

describe('filterErdCollectionTree', () => {
  test('keeps matching ERDs with their parent folders expanded', () => {
    const result = filterErdCollectionTree(erdCollections, 'commerce');

    expect(result.collections).toHaveLength(1);
    expect(result.collections[0].children?.[0].erds?.[0].name).toBe('Commerce Snapshot');
    expect(result.expandedIds.has(1)).toBe(true);
    expect(result.expandedIds.has(2)).toBe(true);
  });

  test('keeps full folder contents when the folder name matches', () => {
    const result = filterErdCollectionTree(erdCollections, 'versions');

    expect(result.collections).toHaveLength(1);
    expect(result.collections[0].children).toHaveLength(1);
    expect(result.collections[0].children?.[0].erds).toHaveLength(1);
  });
});
