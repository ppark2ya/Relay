import { test, expect, request } from '@playwright/test';
import { cleanupAll } from '../helpers/api-cleanup';
import { API_BASE, JSON_PLACEHOLDER } from '../helpers/constants';
import { navigateToRequests, expandCollection, selectRequest } from '../helpers/request-helpers';

test.beforeEach(async () => {
  await cleanupAll();
});

/** Create a collection and request via API, return the request */
async function createRequestViaApi(name = 'Test Request') {
  const ctx = await request.newContext();
  const colRes = await ctx.post(`${API_BASE}/collections`, { data: { name: 'Editor Collection' } });
  const col = await colRes.json();
  const reqRes = await ctx.post(`${API_BASE}/requests`, {
    data: { collectionId: col.id, name, method: 'GET', url: 'https://api.example.com' },
  });
  const req = await reqRes.json();
  await ctx.dispose();
  return req;
}

test.describe('Request Editor', () => {
  test('should change HTTP method', async ({ page }) => {
    await createRequestViaApi();

    await page.goto('/');
    await navigateToRequests(page);
    await expandCollection(page, 'Editor Collection');
    await selectRequest(page, 'Test Request');

    // Click method button to open dropdown (scoped to main area, not sidebar)
    const main = page.locator('main');
    await main.getByRole('button', { name: /^GET/ }).first().click();

    // Select POST from dropdown
    await main.getByRole('button', { name: 'POST' }).click();

    // Method button should now show POST
    await expect(main.getByRole('button', { name: /^POST/ }).first()).toBeVisible();
  });

  test('should input URL and persist after save + reload', async ({ page }) => {
    await createRequestViaApi();

    await page.goto('/');
    await navigateToRequests(page);
    await expandCollection(page, 'Editor Collection');
    await selectRequest(page, 'Test Request');

    // Clear and type new URL
    const urlInput = page.getByPlaceholder(/Enter URL/);
    await urlInput.clear();
    await urlInput.fill(`${JSON_PLACEHOLDER}/posts/1`);

    // Save
    await page.getByRole('button', { name: 'Save' }).click({ force: true });

    // Reload and verify URL persists
    await page.reload();
    await navigateToRequests(page);
    await expandCollection(page, 'Editor Collection');
    await selectRequest(page, 'Test Request');

    await expect(page.getByPlaceholder(/Enter URL/)).toHaveValue(`${JSON_PLACEHOLDER}/posts/1`);
  });

  test('should set body type and content', async ({ page }) => {
    await createRequestViaApi();

    await page.goto('/');
    await navigateToRequests(page);
    await expandCollection(page, 'Editor Collection');
    await selectRequest(page, 'Test Request');

    // Click Body tab
    await page.getByRole('button', { name: /Body/ }).click();

    // Select json radio (label is lowercase)
    await page.getByLabel('json').check();

    // Type JSON body (CodeMirror editor)
    const bodyEditor = page.locator('.cm-content[contenteditable="true"]');
    await bodyEditor.click();
    await bodyEditor.fill('{"title": "test"}');

    // Save
    await page.getByRole('button', { name: 'Save' }).click({ force: true });

    // Reload and verify body persists
    await page.reload();
    await navigateToRequests(page);
    await expandCollection(page, 'Editor Collection');
    await selectRequest(page, 'Test Request');

    await page.getByRole('button', { name: /Body/ }).click();
    await expect(page.getByLabel('json')).toBeChecked();
    await expect(page.locator('.cm-content')).toContainText('"title"');
  });
});
