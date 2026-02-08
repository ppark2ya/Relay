import { test, expect } from '@playwright/test';
import { cleanupAll } from '../helpers/api-cleanup';
import { API_BASE, JSON_PLACEHOLDER } from '../helpers/constants';

test.beforeEach(async () => {
  await cleanupAll();
});

/** Helper: create a collection + request + execute it via API to generate history */
async function createAndExecuteRequest(opts: {
  method: string;
  url: string;
  name?: string;
  headers?: string;
  body?: string;
  bodyType?: string;
}) {
  const { request } = await import('@playwright/test');
  const ctx = await request.newContext();

  // Create collection
  const colResp = await ctx.post(`${API_BASE}/collections`, {
    data: { name: 'Test Collection' },
  });
  const col = await colResp.json();

  // Create request
  const reqResp = await ctx.post(`${API_BASE}/requests`, {
    data: {
      collectionId: col.id,
      name: opts.name || 'Test Request',
      method: opts.method,
      url: opts.url,
      headers: opts.headers || '{}',
      body: opts.body || '',
      bodyType: opts.bodyType || 'none',
    },
  });
  const req = await reqResp.json();

  // Execute request
  const execResp = await ctx.post(`${API_BASE}/requests/${req.id}/execute`);
  const result = await execResp.json();

  await ctx.dispose();
  return { collectionId: col.id, requestId: req.id, result };
}

test.describe('History - Date Grouping', () => {
  test('should show history items grouped under Today', async ({ page }) => {
    // Generate history via API
    await createAndExecuteRequest({
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/1`,
    });

    await page.goto('/');

    // Navigate to History tab
    await page.getByRole('button', { name: 'History' }).click();

    // Should show "Today" group header
    await expect(page.getByText('Today')).toBeVisible();

    // Should show the history item with method and URL
    await expect(page.getByText('GET').first()).toBeVisible();
    const urlText = page.getByText(/jsonplaceholder/).first();
    await expect(urlText).toBeVisible();
  });

  test('should collapse and expand date groups', async ({ page }) => {
    // Generate history
    await createAndExecuteRequest({
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/1`,
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'History' }).click();

    // Today group should be expanded by default, item should be visible
    const historyItem = page.getByText(/jsonplaceholder/).first();
    await expect(historyItem).toBeVisible();

    // Click "Today" to collapse
    await page.getByText('Today').click();

    // Item should be hidden
    await expect(historyItem).not.toBeVisible();

    // Click "Today" again to expand
    await page.getByText('Today').click();
    await expect(historyItem).toBeVisible();
  });

  test('should show item count in date group header', async ({ page }) => {
    // Generate 2 history items
    await createAndExecuteRequest({
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/1`,
    });
    await createAndExecuteRequest({
      method: 'POST',
      url: `${JSON_PLACEHOLDER}/posts`,
      bodyType: 'json',
      body: '{"title":"test"}',
      headers: '{"Content-Type":"application/json"}',
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'History' }).click();

    // The group header should show count "2"
    await expect(page.getByText('Today')).toBeVisible();
    // Find the count badge next to Today (the "2" text in the group header)
    const todayGroup = page.getByText('Today').locator('..');
    await expect(todayGroup.getByText('2')).toBeVisible();
  });
});

test.describe('History - Click to Load', () => {
  test('should load history item into RequestEditor when clicked', async ({ page }) => {
    // Generate history via API
    await createAndExecuteRequest({
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/1`,
      name: 'Get Post 1',
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'History' }).click();

    // Click on the history item
    await page.getByText(/jsonplaceholder/).first().click();

    // Should switch to request view with the loaded data
    // The history banner should be visible
    await expect(page.getByText('Loaded from history')).toBeVisible();

    // URL should be populated
    const urlInput = page.locator('input[placeholder*="Enter URL"]');
    await expect(urlInput).toHaveValue(/jsonplaceholder.*posts\/1/);

    // Save button should NOT be visible (since it's from history with id=0)
    await expect(page.getByRole('button', { name: 'Save', exact: true })).not.toBeVisible();

    // Send button should be visible
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
  });

  test('should show response data from history in ResponseViewer', async ({ page }) => {
    // Generate history
    await createAndExecuteRequest({
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/1`,
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'History' }).click();

    // Click on the history item
    await page.getByText(/jsonplaceholder/).first().click();

    // ResponseViewer should show status code 200
    await expect(page.getByText('200')).toBeVisible();

    // Should show response body content (JSONPlaceholder returns userId, id, title, body)
    await expect(page.getByText('"userId"').first()).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('History - Re-execute', () => {
  test('should re-execute request from history via Send button', async ({ page }) => {
    // Generate history
    await createAndExecuteRequest({
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/2`,
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'History' }).click();

    // Click on the history item to load it
    await page.getByText(/jsonplaceholder/).first().click();

    // Wait for the editor to load
    await expect(page.getByText('Loaded from history')).toBeVisible();

    // Click Send to re-execute
    await page.getByRole('button', { name: 'Send' }).click();

    // Wait for execution to complete - should show fresh 200 response
    await expect(page.getByText('200')).toBeVisible({ timeout: 30_000 });
    // Response should contain post data
    await expect(page.getByText('"userId"').first()).toBeVisible({ timeout: 5_000 });
  });

  test('should re-execute even after original request is deleted (ad-hoc)', async ({ page }) => {
    // Generate history and then delete the original request
    const { requestId, collectionId } = await createAndExecuteRequest({
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/3`,
    });

    // Delete original request and collection via API
    const { request } = await import('@playwright/test');
    const ctx = await request.newContext();
    await ctx.delete(`${API_BASE}/requests/${requestId}`);
    await ctx.delete(`${API_BASE}/collections/${collectionId}`);
    await ctx.dispose();

    await page.goto('/');
    await page.getByRole('button', { name: 'History' }).click();

    // Click on the history item (original request is deleted, so id will be null → 0)
    await page.getByText(/jsonplaceholder/).first().click();

    // Should load into editor
    await expect(page.getByText('Loaded from history')).toBeVisible();

    // Click Send to re-execute via ad-hoc endpoint
    await page.getByRole('button', { name: 'Send' }).click();

    // Should get a successful response
    await expect(page.getByText('200')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('"userId"').first()).toBeVisible({ timeout: 5_000 });
  });
});
