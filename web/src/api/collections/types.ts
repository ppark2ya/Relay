import type { Request } from '../requests/types';

export interface Collection {
  id: number;
  name: string;
  parentId?: number;
  sortOrder: number;
  children?: Collection[];
  requests?: Request[];
  createdAt: string;
  updatedAt: string;
}
