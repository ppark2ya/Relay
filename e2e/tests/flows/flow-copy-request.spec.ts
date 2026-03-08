import { test, expect } from '@playwright/test';
import { request as apiRequest } from '@playwright/test';
import { cleanupAll } from '../helpers/api-cleanup';
import { navigateToFlows, createFlow, runFlowAndWaitForResult } from '../helpers/flow-helpers';
import { API_BASE, JSON_PLACEHOLDER } from '../helpers/constants';

test.beforeEach(async () => {
  await cleanupAll();
});

test.describe('Flow Copy From Request', () => {
  test('should copy a request into a flow step', async ({ page }) => {
    // Create a collection and request via API
    const ctx = await apiRequest.newContext();

    const colRes = await ctx.post(`${API_BASE}/collections`, {
      data: { name: 'Test Collection' },
    });
    const collection = await colRes.json();

    const reqRes = await ctx.post(`${API_BASE}/requests`, {
      data: {
        name: 'Get Post 1',
        method: 'GET',
        url: `${JSON_PLACEHOLDER}/posts/1`,
        headers: '{}',
        body: '',
        bodyType: 'none',
        collectionId: collection.id,
      },
    });
    const request = await reqRes.json();

    await ctx.dispose();

    // Create a flow in UI
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'Copy Request Test');

    // Add step from request
    await page.getByRole('button', { name: 'Add Step' }).click();
    await page.getByText('Copy From Request').click();

    // Select the request from the dropdown (wait for request list to load)
    const copyDropdown = page.locator('.max-h-64');
    await expect(copyDropdown.getByText('Select a request to copy')).toBeVisible();
    await expect(copyDropdown.getByText('Get Post 1')).toBeVisible({ timeout: 15_000 });
    await copyDropdown.getByText('Get Post 1').click();

    // Verify step was created with request data
    await expect(page.getByText('Get Post 1').first()).toBeVisible();

    // Run flow and verify success
    await runFlowAndWaitForResult(page);

    await expect(page.getByText('Success')).toBeVisible();
    await expect(page.getByText('200', { exact: true })).toBeVisible();
  });
});
