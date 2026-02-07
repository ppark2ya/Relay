import { test, expect, request } from '@playwright/test';
import { cleanupAll } from '../helpers/api-cleanup';
import { API_BASE, JSON_PLACEHOLDER } from '../helpers/constants';
import { navigateToRequests, expandCollection, selectRequest } from '../helpers/request-helpers';

test.beforeEach(async () => {
  await cleanupAll();
});

/** Create a collection + request via API */
async function createRequestViaApi(opts: { name: string; method: string; url: string; body?: string; bodyType?: string }) {
  const ctx = await request.newContext();
  const colRes = await ctx.post(`${API_BASE}/collections`, { data: { name: 'Execute Collection' } });
  const col = await colRes.json();
  const reqRes = await ctx.post(`${API_BASE}/requests`, {
    data: { collectionId: col.id, ...opts },
  });
  const req = await reqRes.json();
  await ctx.dispose();
  return req;
}

test.describe('Request Execute', () => {
  test('should execute GET request and show 200 response', async ({ page }) => {
    await createRequestViaApi({
      name: 'Get Post',
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/1`,
    });

    await page.goto('/');
    await navigateToRequests(page);
    await expandCollection(page, 'Execute Collection');
    await selectRequest(page, 'Get Post');

    // Click Send
    await page.getByRole('button', { name: 'Send' }).click();

    // Wait for response status code 200
    await expect(page.getByText('200')).toBeVisible({ timeout: 30_000 });

    // Response body should contain JSON content (rendered via CodeMirror for JSON)
    await expect(page.locator('.cm-content')).toContainText('userId');
  });

  test('should execute POST request and show 201 response', async ({ page }) => {
    await createRequestViaApi({
      name: 'Create Post',
      method: 'POST',
      url: `${JSON_PLACEHOLDER}/posts`,
      body: '{"title": "foo", "body": "bar", "userId": 1}',
      bodyType: 'json',
    });

    await page.goto('/');
    await navigateToRequests(page);
    await expandCollection(page, 'Execute Collection');
    await selectRequest(page, 'Create Post');

    // Click Send
    await page.getByRole('button', { name: 'Send' }).click();

    // Wait for response status code 201
    await expect(page.getByText('201')).toBeVisible({ timeout: 30_000 });
  });

  test('should show response headers tab', async ({ page }) => {
    await createRequestViaApi({
      name: 'Headers Check',
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/1`,
    });

    await page.goto('/');
    await navigateToRequests(page);
    await expandCollection(page, 'Execute Collection');
    await selectRequest(page, 'Headers Check');

    // Execute the request
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('200')).toBeVisible({ timeout: 30_000 });

    // Click Headers tab in the response viewer (the second "Headers" button on the page)
    await page.getByRole('button', { name: 'Headers' }).nth(1).click();

    // Should show Content-Type header
    await expect(page.getByText('Content-Type', { exact: true })).toBeVisible();
  });
});
