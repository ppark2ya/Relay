import type { ErdDocument } from '../erds/types';

export interface ErdCollection {
  id: number;
  name: string;
  parentId?: number;
  sortOrder: number;
  children?: ErdCollection[];
  erds?: ErdDocument[];
  createdAt: string;
  updatedAt: string;
}
