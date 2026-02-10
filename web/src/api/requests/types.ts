export interface Request {
  id: number;
  collectionId?: number;
  name: string;
  method: string;
  url: string;
  headers?: string;
  body?: string;
  bodyType?: string;
  cookies?: string;
  proxyId?: number | null;
  sortOrder: number;
  preScript?: string;
  postScript?: string;
  createdAt?: string;
  updatedAt?: string;
}
