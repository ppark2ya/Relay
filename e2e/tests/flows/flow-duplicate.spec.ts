import { test, expect } from '@playwright/test';
import { cleanupAll } from '../helpers/api-cleanup';
import { navigateToFlows, createFlow, addBlankStep, configureStep, saveStep } from '../helpers/flow-helpers';

test.beforeEach(async () => {
  await cleanupAll();
});

test.describe('Flow Duplicate', () => {
  test('should duplicate a flow', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'Original Flow');

    const sidebar = page.getByRole('complementary');
    await expect(sidebar.getByText('Original Flow')).toBeVisible();

    // Click duplicate button on the flow row
    const flowItem = sidebar.locator('.group', { hasText: 'Original Flow' });
    await flowItem.hover();
    await flowItem.getByTitle('Duplicate Flow').click({ force: true });

    // Verify copy appears in sidebar
    await expect(sidebar.getByText('Original Flow (Copy)')).toBeVisible();

    // Original should still exist
    await expect(sidebar.getByText('Original Flow').first()).toBeVisible();
  });

  test('should duplicate a flow with steps', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'Flow With Steps');

    // Add a step and configure it
    await addBlankStep(page);

    // Expand the step (click the step card)
    await page.getByText('Untitled Step').click();

    await configureStep(page, {
      name: 'Login Step',
      method: 'POST',
      url: 'https://api.example.com/login',
    });
    await saveStep(page);

    // Go back to sidebar and duplicate the flow
    const sidebar = page.getByRole('complementary');
    const flowItem = sidebar.locator('.group', { hasText: 'Flow With Steps' });
    await flowItem.hover();
    await flowItem.getByTitle('Duplicate Flow').click({ force: true });

    // Verify copy appears
    await expect(sidebar.getByText('Flow With Steps (Copy)')).toBeVisible();

    // Click on the duplicated flow to check its steps
    await sidebar.getByText('Flow With Steps (Copy)').click();

    // The duplicated flow should have the step
    await expect(page.getByText('Login Step')).toBeVisible();
  });
});
