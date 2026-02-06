import { test, expect } from '@playwright/test';
import { cleanupAll } from '../helpers/api-cleanup';
import {
  navigateToFlows,
  createFlow,
  addBlankStep,
  configureStep,
  saveStep,
  runFlowAndWaitForResult,
} from '../helpers/flow-helpers';
import { JSON_PLACEHOLDER } from '../helpers/constants';

test.beforeEach(async () => {
  await cleanupAll();
});

test.describe('Flow Run', () => {
  test('should run a single GET step successfully', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'GET Run Test');
    await addBlankStep(page);

    // Expand and configure step
    await page.getByText('Untitled Step').click();
    await configureStep(page, {
      name: 'Get Post 1',
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/1`,
    });
    await saveStep(page);

    // Run flow
    await runFlowAndWaitForResult(page);

    // Verify result
    await expect(page.getByText('Success')).toBeVisible();
    await expect(page.getByText('200')).toBeVisible();
  });

  test('should run a POST step successfully', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'POST Run Test');
    await addBlankStep(page);

    // Expand and configure step
    await page.getByText('Untitled Step').click();
    await configureStep(page, {
      name: 'Create Post',
      method: 'POST',
      url: `${JSON_PLACEHOLDER}/posts`,
      bodyType: 'json',
      body: JSON.stringify({ title: 'foo', body: 'bar', userId: 1 }),
    });
    await saveStep(page);

    // Run flow
    await runFlowAndWaitForResult(page);

    // Verify result
    await expect(page.getByText('Success')).toBeVisible();
    await expect(page.getByText('201')).toBeVisible();
  });

  test('should run multiple steps successfully', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'Multi Step Test');

    // Step 1: GET /posts/1
    await addBlankStep(page);
    await page.getByText('Untitled Step').click();
    await configureStep(page, {
      name: 'Get Post',
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/1`,
    });
    await saveStep(page);

    // Step 2: GET /posts/1/comments
    await addBlankStep(page);
    await page.getByText('Untitled Step').click();
    await configureStep(page, {
      name: 'Get Comments',
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/1/comments`,
    });
    await saveStep(page);

    // Run flow
    await runFlowAndWaitForResult(page);

    // Verify both steps succeeded
    await expect(page.getByText('Success')).toBeVisible();
    // Both step results should show 200
    const statusCodes = page.getByText('200');
    await expect(statusCodes.first()).toBeVisible();
    await expect(statusCodes.nth(1)).toBeVisible();
  });
});
