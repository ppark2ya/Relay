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

test.describe('Flow Run Error Handling', () => {
  test('should show error banner when step has no URL', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'No URL Error Test');
    await addBlankStep(page);

    // Expand and configure step with name only (no URL)
    await page.getByText('Untitled Step').click();
    await configureStep(page, { name: 'Empty URL Step' });
    await saveStep(page);

    // Run flow
    await runFlowAndWaitForResult(page);

    // Verify flow-level error banner appears
    await expect(page.getByText('step has no URL configured').first()).toBeVisible();
    await expect(page.getByText('Failed')).toBeVisible();
  });

  test('should show step card error indicators when network request fails', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'Card Error Test');

    // Step 1: bad URL (will fail)
    await addBlankStep(page);
    await page.getByText('Untitled Step').click();
    await configureStep(page, {
      name: 'Failing Step',
      method: 'GET',
      url: 'http://unreachable.invalid/test',
    });
    await saveStep(page);

    // Step 2: good URL (won't execute due to step 1 failure)
    await addBlankStep(page);
    await page.getByText('Untitled Step').click();
    await configureStep(page, {
      name: 'OK Step',
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/1`,
    });
    await saveStep(page);

    // Run flow
    await runFlowAndWaitForResult(page);

    // Step 1 card should have red background and error badge
    const stepCards = page.locator('.flex.items-stretch.gap-3');
    const step1Card = stepCards.nth(0);
    const step1Circle = step1Card.locator('.rounded-full').first();
    await expect(step1Circle).toHaveClass(/bg-red-500/);

    // Step 1 card content should have red background
    const step1Content = step1Card.locator('.rounded-lg.border').first();
    await expect(step1Content).toHaveClass(/bg-red-50/);
    await expect(step1Content).toHaveClass(/border-red-300/);

    // Step 1 should show ERR badge
    await expect(step1Card.getByText('ERR')).toBeVisible();

    // Step 1 should show error message in the card
    await expect(step1Card.getByText('unreachable.invalid').first()).toBeVisible();

    // Step 2 should remain default (not executed)
    const step2Card = stepCards.nth(1);
    const step2Circle = step2Card.locator('.rounded-full').first();
    await expect(step2Circle).toHaveClass(/bg-blue-600/);
  });

  test('should show green indicators on success', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'Success Card Test');
    await addBlankStep(page);

    await page.getByText('Untitled Step').click();
    await configureStep(page, {
      name: 'Good Step',
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/1`,
    });
    await saveStep(page);

    await runFlowAndWaitForResult(page);

    // Step card should have green indicators
    const stepCard = page.locator('.flex.items-stretch.gap-3').first();
    const circle = stepCard.locator('.rounded-full').first();
    await expect(circle).toHaveClass(/bg-green-500/);

    const content = stepCard.locator('.rounded-lg.border').first();
    await expect(content).toHaveClass(/bg-green-50/);

    // Should show 200 badge (look for the status badge specifically by its rounded-full class)
    await expect(stepCard.locator('.rounded-full.text-xs:has-text("200")')).toBeVisible();
  });
});
