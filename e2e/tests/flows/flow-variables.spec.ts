import { test, expect } from '@playwright/test';
import { request as apiRequest } from '@playwright/test';
import { cleanupAll } from '../helpers/api-cleanup';
import { navigateToFlows } from '../helpers/flow-helpers';
import { API_BASE, JSON_PLACEHOLDER } from '../helpers/constants';

test.beforeEach(async () => {
  await cleanupAll();
});

test.describe('Flow Variables', () => {
  test('should extract variable and chain between steps', async ({ page }) => {
    // Create flow and steps via API for faster setup
    const ctx = await apiRequest.newContext();

    const flowRes = await ctx.post(`${API_BASE}/flows`, {
      data: { name: 'Variable Chain Test', description: '' },
    });
    const flow = await flowRes.json();

    // Step 1: GET /posts/1, extract userId
    await ctx.post(`${API_BASE}/flows/${flow.id}/steps`, {
      data: {
        stepOrder: 1,
        delayMs: 0,
        extractVars: '{"userId": "$.userId"}',
        condition: '',
        name: 'Get Post',
        method: 'GET',
        url: `${JSON_PLACEHOLDER}/posts/1`,
        headers: '{}',
        body: '',
        bodyType: 'none',
      },
    });

    // Step 2: GET /users/{{userId}}
    await ctx.post(`${API_BASE}/flows/${flow.id}/steps`, {
      data: {
        stepOrder: 2,
        delayMs: 0,
        extractVars: '{}',
        condition: '',
        name: 'Get User',
        method: 'GET',
        url: `${JSON_PLACEHOLDER}/users/{{userId}}`,
        headers: '{}',
        body: '',
        bodyType: 'none',
      },
    });

    await ctx.dispose();

    // Open the flow in UI
    await page.goto('/');
    await navigateToFlows(page);
    await page.getByText('Variable Chain Test').click();

    // Verify steps are visible
    await expect(page.getByText('Get Post')).toBeVisible();
    await expect(page.getByText('Get User')).toBeVisible();

    // Run flow
    await page.getByRole('button', { name: 'Run Flow' }).click();
    await expect(page.getByText('Flow Result')).toBeVisible({ timeout: 30_000 });

    // Both steps should succeed (userId=1 extracted from first step → /users/1)
    await expect(page.getByText('Success')).toBeVisible();
    const statusCodes = page.getByText('200');
    await expect(statusCodes.first()).toBeVisible();
    await expect(statusCodes.nth(1)).toBeVisible();
  });
});
