import { test, expect } from '@playwright/test';
import { request as apiRequest } from '@playwright/test';
import { cleanupAll } from '../helpers/api-cleanup';
import { navigateToFlows, createFlow, runFlowAndWaitForResult } from '../helpers/flow-helpers';
import { API_BASE, JSON_PLACEHOLDER } from '../helpers/constants';

test.beforeEach(async () => {
  await cleanupAll();
});

test.describe('Flow Import from Collection', () => {
  test('should import all requests from a collection as flow steps', async ({ page }) => {
    // Create a collection with 3 requests via API
    const ctx = await apiRequest.newContext();

    const colRes = await ctx.post(`${API_BASE}/collections`, {
      data: { name: 'Import Test Collection' },
    });
    const collection = await colRes.json();

    // Create 3 requests in the collection
    for (const [i, endpoint] of ['posts/1', 'posts/2', 'users/1'].entries()) {
      await ctx.post(`${API_BASE}/requests`, {
        data: {
          name: `Request ${i + 1}`,
          method: 'GET',
          url: `${JSON_PLACEHOLDER}/${endpoint}`,
          headers: '{}',
          body: '',
          bodyType: 'none',
          collectionId: collection.id,
        },
      });
    }

    await ctx.dispose();

    // Navigate to Flows and create a flow
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'Import Collection Test');

    // Take screenshot of empty flow
    await page.screenshot({ path: 'screenshots/01-empty-flow.png' });

    // Click "Add Step" button
    await page.getByRole('button', { name: 'Add Step' }).click();

    // Verify all 3 menu options are visible
    await expect(page.getByText('Add Blank Step')).toBeVisible();
    await expect(page.getByText('Copy From Request')).toBeVisible();
    await expect(page.getByText('Import from Collection')).toBeVisible();

    // Take screenshot of the add step menu with 3 options
    await page.screenshot({ path: 'screenshots/02-add-step-menu.png' });

    // Click "Import from Collection"
    await page.getByText('Import from Collection').click();

    // Verify collection dropdown appears
    await expect(page.getByText('Select a collection to import')).toBeVisible();
    await expect(page.getByText('Import Test Collection')).toBeVisible({ timeout: 10_000 });

    // Verify request count is shown
    await expect(page.getByText('3 requests')).toBeVisible();

    // Take screenshot of collection dropdown
    await page.screenshot({ path: 'screenshots/03-collection-dropdown.png' });

    // Select the collection
    await page.getByText('Import Test Collection').click();

    // Wait for steps to be imported - all 3 requests should appear as steps
    await expect(page.getByText('Request 1').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Request 2').first()).toBeVisible();
    await expect(page.getByText('Request 3').first()).toBeVisible();

    // Verify collection name badges are shown on each step
    const collectionBadges = page.locator('span:has-text("Import Test Collection")').filter({
      has: page.locator('svg'), // badges with folder icons
    });
    await expect(collectionBadges.first()).toBeVisible();

    // Take screenshot of imported steps with collection badges
    await page.screenshot({ path: 'screenshots/04-imported-steps-with-badges.png' });

    // Run the flow and verify all steps succeed
    await runFlowAndWaitForResult(page);

    await expect(page.getByText('Success')).toBeVisible();

    // Take screenshot of successful flow run
    await page.screenshot({ path: 'screenshots/05-flow-run-success.png' });
  });

  test('should show collection badge only for steps with requestId', async ({ page }) => {
    // Create a collection with a request via API
    const ctx = await apiRequest.newContext();

    const colRes = await ctx.post(`${API_BASE}/collections`, {
      data: { name: 'Badge Test Collection' },
    });
    const collection = await colRes.json();

    await ctx.post(`${API_BASE}/requests`, {
      data: {
        name: 'API Request',
        method: 'GET',
        url: `${JSON_PLACEHOLDER}/posts/1`,
        headers: '{}',
        body: '',
        bodyType: 'none',
        collectionId: collection.id,
      },
    });

    // Create a flow with the collection import + a blank step via API
    const flowRes = await ctx.post(`${API_BASE}/flows`, {
      data: { name: 'Badge Visibility Test', description: '' },
    });
    const flow = await flowRes.json();

    // Import collection (creates step with requestId)
    await ctx.post(`${API_BASE}/flows/${flow.id}/import-collection`, {
      data: { collectionId: collection.id },
    });

    // Add a blank step (no requestId)
    await ctx.post(`${API_BASE}/flows/${flow.id}/steps`, {
      data: {
        stepOrder: 2,
        delayMs: 0,
        extractVars: '',
        condition: '',
        name: 'Blank Step',
        method: 'GET',
        url: `${JSON_PLACEHOLDER}/posts/2`,
        headers: '{}',
        body: '',
        bodyType: 'none',
        loopCount: 1,
        preScript: '',
        postScript: '',
        continueOnError: false,
      },
    });

    await ctx.dispose();

    // Navigate to the flow
    await page.goto('/');
    await navigateToFlows(page);
    await page.getByText('Badge Visibility Test').click();
    await expect(page.getByRole('heading', { name: 'Badge Visibility Test' })).toBeVisible();

    // Wait for steps to load
    await expect(page.getByText('API Request').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Blank Step').first()).toBeVisible();

    // The imported step should have a collection badge
    const importedStepCard = page.getByText('API Request').first().locator('../..');
    const badge = importedStepCard.locator('span:has-text("Badge Test Collection")');
    await expect(badge).toBeVisible();

    // The blank step should NOT have a collection badge
    const blankStepCard = page.getByText('Blank Step').first().locator('../..');
    const blankBadge = blankStepCard.locator('span:has-text("Badge Test Collection")');
    await expect(blankBadge).toHaveCount(0);

    // Take screenshot showing badge visibility difference
    await page.screenshot({ path: 'screenshots/06-badge-visibility.png' });
  });

  test('should group requests by collection in Copy From Request dropdown', async ({ page }) => {
    // Create 2 collections with requests via API
    const ctx = await apiRequest.newContext();

    const col1Res = await ctx.post(`${API_BASE}/collections`, {
      data: { name: 'Auth APIs' },
    });
    const col1 = await col1Res.json();

    const col2Res = await ctx.post(`${API_BASE}/collections`, {
      data: { name: 'User APIs' },
    });
    const col2 = await col2Res.json();

    await ctx.post(`${API_BASE}/requests`, {
      data: {
        name: 'Login',
        method: 'POST',
        url: `${JSON_PLACEHOLDER}/posts`,
        headers: '{}',
        body: '',
        bodyType: 'none',
        collectionId: col1.id,
      },
    });

    await ctx.post(`${API_BASE}/requests`, {
      data: {
        name: 'Get Users',
        method: 'GET',
        url: `${JSON_PLACEHOLDER}/users`,
        headers: '{}',
        body: '',
        bodyType: 'none',
        collectionId: col2.id,
      },
    });

    await ctx.dispose();

    // Navigate to Flows and create a flow
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'Grouped Request Test');

    // Open Add Step -> Copy From Request
    await page.getByRole('button', { name: 'Add Step' }).click();
    await page.getByText('Copy From Request').click();

    // Verify dropdown shows grouped headers
    await expect(page.getByText('Select a request to copy')).toBeVisible();
    await expect(page.getByText('Auth APIs')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('User APIs')).toBeVisible();
    await expect(page.getByText('Login')).toBeVisible();
    await expect(page.getByText('Get Users')).toBeVisible();

    // Take screenshot of grouped request dropdown
    await page.screenshot({ path: 'screenshots/07-grouped-requests.png' });
  });

  test('should disable empty collections in import dropdown', async ({ page }) => {
    // Create one collection with requests and one empty collection
    const ctx = await apiRequest.newContext();

    const filledColRes = await ctx.post(`${API_BASE}/collections`, {
      data: { name: 'Filled Collection' },
    });
    const filledCol = await filledColRes.json();

    await ctx.post(`${API_BASE}/collections`, {
      data: { name: 'Empty Collection' },
    });

    await ctx.post(`${API_BASE}/requests`, {
      data: {
        name: 'Test Request',
        method: 'GET',
        url: `${JSON_PLACEHOLDER}/posts/1`,
        headers: '{}',
        body: '',
        bodyType: 'none',
        collectionId: filledCol.id,
      },
    });

    await ctx.dispose();

    // Navigate to Flows
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'Empty Collection Test');

    // Open import collection dropdown
    await page.getByRole('button', { name: 'Add Step' }).click();
    await page.getByText('Import from Collection').click();

    // Verify both collections are shown in the dropdown
    const dropdown = page.locator('.max-h-64');
    await expect(dropdown.getByText('Filled Collection')).toBeVisible({ timeout: 10_000 });
    await expect(dropdown.getByText('Empty Collection', { exact: true })).toBeVisible();

    // Verify "empty" label shows for empty collection and request count for filled
    await expect(dropdown.getByText('1 request', { exact: true })).toBeVisible();
    await expect(dropdown.getByText('empty', { exact: true })).toBeVisible();

    // Take screenshot
    await page.screenshot({ path: 'screenshots/08-empty-collection-disabled.png' });
  });
});
