import { test, expect, request } from '@playwright/test';
import { cleanupAll } from '../helpers/api-cleanup';
import { API_BASE, JSON_PLACEHOLDER } from '../helpers/constants';
import { navigateToRequests, expandCollection, selectRequest } from '../helpers/request-helpers';

test.beforeEach(async () => {
  await cleanupAll();
});

/** Create a collection + request via API */
async function createRequestViaApi(name = 'Params Request') {
  const ctx = await request.newContext();
  const colRes = await ctx.post(`${API_BASE}/collections`, { data: { name: 'Params Collection' } });
  const col = await colRes.json();
  const reqRes = await ctx.post(`${API_BASE}/requests`, {
    data: { collectionId: col.id, name, method: 'GET', url: `${JSON_PLACEHOLDER}/posts` },
  });
  const req = await reqRes.json();
  await ctx.dispose();
  return req;
}

test.describe('Request Params & Headers Tabs', () => {
  test('should add a query parameter and reflect in URL', async ({ page }) => {
    await createRequestViaApi();

    await page.goto('/');
    await navigateToRequests(page);
    await expandCollection(page, 'Params Collection');
    await selectRequest(page, 'Params Request');

    // Params tab should be active by default
    await page.getByText('+ Add Parameter').click();

    // Fill parameter key and value
    await page.getByPlaceholder('Parameter name').fill('userId');
    await page.getByPlaceholder('Value').first().fill('1');

    // URL should now contain the query parameter
    await expect(page.getByPlaceholder(/Enter URL/)).toHaveValue(/userId=1/);
  });

  test('should add a header', async ({ page }) => {
    await createRequestViaApi();

    await page.goto('/');
    await navigateToRequests(page);
    await expandCollection(page, 'Params Collection');
    await selectRequest(page, 'Params Request');

    // Click Headers tab
    await page.getByRole('button', { name: /^Headers/ }).click();

    // Add a header
    await page.getByText('+ Add Header').click();

    // Fill header key and value
    await page.getByPlaceholder('Header name').fill('X-Custom-Header');
    await page.getByPlaceholder('Value').first().fill('test-value');

    // Verify the inputs have the values
    await expect(page.getByPlaceholder('Header name')).toHaveValue('X-Custom-Header');
    await expect(page.getByPlaceholder('Value').first()).toHaveValue('test-value');

    // Header badge count should show 1
    await expect(page.getByRole('button', { name: /^Headers/ })).toContainText('1');
  });
});
