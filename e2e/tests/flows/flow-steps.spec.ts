import { test, expect } from '@playwright/test';
import { cleanupAll } from '../helpers/api-cleanup';
import { navigateToFlows, createFlow, addBlankStep, configureStep, saveStep } from '../helpers/flow-helpers';
import { JSON_PLACEHOLDER } from '../helpers/constants';

test.beforeEach(async () => {
  await cleanupAll();
});

test.describe('Flow Steps', () => {
  test('should add a blank step', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'Step Test Flow');

    // Verify empty state
    await expect(page.getByText('No steps in this flow yet.')).toBeVisible();

    // Add blank step
    await addBlankStep(page);

    // Verify step card appeared
    await expect(page.getByText('Untitled Step')).toBeVisible();
    await expect(page.getByText('GET')).toBeVisible();
  });

  test('should expand a step to show inline editor', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'Expand Test');
    await addBlankStep(page);

    // Click on the step to expand it
    await page.getByText('Untitled Step').click();

    // Verify inline editor fields are visible
    await expect(page.getByPlaceholder('Step name')).toBeVisible();
    await expect(page.getByPlaceholder('https://api.example.com/endpoint')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Step' })).toBeVisible();
  });

  test('should configure and save a step', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'Config Test');
    await addBlankStep(page);

    // Expand step
    await page.getByText('Untitled Step').click();

    // Configure step
    await configureStep(page, {
      name: 'Get Post',
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/1`,
    });

    // Save (also closes the modal)
    await saveStep(page);

    // Verify step card shows updated info
    await expect(page.getByText('Get Post')).toBeVisible();
    await expect(page.getByText(`${JSON_PLACEHOLDER}/posts/1`)).toBeVisible();
  });

  test('should delete a step', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'Delete Step Test');
    await addBlankStep(page);

    // Verify step exists
    await expect(page.getByText('Untitled Step')).toBeVisible();

    // The step card is inside the flow editor area (not sidebar)
    // Find the step group containing "Untitled Step" text
    const stepCard = page.locator('.rounded-lg.border.overflow-hidden.group', { hasText: 'Untitled Step' });
    await stepCard.hover();

    // Click trash icon button (force: true because it's opacity-0 until hover)
    await stepCard.locator('button').filter({ has: page.locator('svg') }).click({ force: true });

    // Verify step is removed
    await expect(page.getByText('Untitled Step')).not.toBeVisible();
    await expect(page.getByText('No steps in this flow yet.')).toBeVisible();
  });
});
