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
  createdAt?: string;
  updatedAt?: string;
}
