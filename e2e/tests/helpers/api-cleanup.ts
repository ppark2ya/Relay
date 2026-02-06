import { request } from '@playwright/test';
import { API_BASE } from './constants';

export async function cleanupAll() {
  const ctx = await request.newContext();

  // Delete all flows (steps cascade)
  const flows = await ctx.get(`${API_BASE}/flows`);
  if (flows.ok()) {
    for (const flow of await flows.json()) {
      await ctx.delete(`${API_BASE}/flows/${flow.id}`);
    }
  }

  // Delete all requests
  const requests = await ctx.get(`${API_BASE}/requests`);
  if (requests.ok()) {
    for (const req of await requests.json()) {
      await ctx.delete(`${API_BASE}/requests/${req.id}`);
    }
  }

  // Delete all collections
  const collections = await ctx.get(`${API_BASE}/collections`);
  if (collections.ok()) {
    for (const col of await collections.json()) {
      await ctx.delete(`${API_BASE}/collections/${col.id}`);
    }
  }

  // Delete all history
  const history = await ctx.get(`${API_BASE}/history`);
  if (history.ok()) {
    for (const h of await history.json()) {
      await ctx.delete(`${API_BASE}/history/${h.id}`);
    }
  }

  // Deactivate proxy
  await ctx.post(`${API_BASE}/proxies/deactivate`);

  await ctx.dispose();
}
