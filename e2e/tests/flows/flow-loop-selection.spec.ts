import { test, expect } from '@playwright/test';
import { cleanupAll } from '../helpers/api-cleanup';
import { navigateToFlows, createFlow, addBlankStep, configureStep, saveStep, runFlowAndWaitForResult } from '../helpers/flow-helpers';
import { JSON_PLACEHOLDER } from '../helpers/constants';

test.beforeEach(async () => {
  await cleanupAll();
});

test.describe('Flow Loop and Selection Features', () => {
  test('should show blue dot indicator when step has unsaved changes', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'Blue Dot Test');
    await addBlankStep(page);

    // Expand step
    await page.getByText('Untitled Step').click();

    // Verify no blue dot initially
    const stepTitle = page.locator('span.font-medium', { hasText: 'Untitled Step' });
    await expect(stepTitle.locator('span.rounded-full.bg-blue-500')).not.toBeVisible();

    // Make a change
    await page.getByPlaceholder('Step name').fill('Changed Name');

    // Verify blue dot appears next to the title
    const changedTitle = page.locator('span.font-medium', { hasText: 'Changed Name' });
    await expect(changedTitle.locator('span.rounded-full.bg-blue-500')).toBeVisible();

    // Save the step
    await saveStep(page);

    // Verify blue dot disappears after save
    await expect(changedTitle.locator('span.rounded-full.bg-blue-500')).not.toBeVisible();
  });

  test('should save step with Ctrl+S', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'Ctrl+S Test');
    await addBlankStep(page);

    // Expand step
    await page.getByText('Untitled Step').click();

    // Configure step
    await configureStep(page, {
      name: 'Keyboard Save',
      url: `${JSON_PLACEHOLDER}/posts/1`,
    });

    // Save with Ctrl+S
    await page.keyboard.press('Control+s');

    // Wait a bit for save to complete
    await page.waitForTimeout(500);

    // Close the modal
    await page.keyboard.press('Escape');

    // Reload page
    await page.reload();
    await navigateToFlows(page);

    // Click on the flow in sidebar
    await page.getByText('Ctrl+S Test').click();

    // Verify step was saved
    await expect(page.getByText('Keyboard Save')).toBeVisible();
    await expect(page.getByText(`${JSON_PLACEHOLDER}/posts/1`)).toBeVisible();
  });

  test('should configure loop count for a step', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'Loop Count Test');
    await addBlankStep(page);

    // Expand step
    await page.getByText('Untitled Step').click();

    // Configure step with loop count
    await configureStep(page, {
      name: 'Loop Step',
      url: `${JSON_PLACEHOLDER}/posts/1`,
    });

    // Find and set loop count
    const loopInput = page.locator('input[type="number"][min="1"][max="100"]');
    await loopInput.clear();
    await loopInput.fill('3');

    // Save
    await saveStep(page);

    // Verify loop badge appears on step card
    await expect(page.locator('span', { hasText: '×3' })).toBeVisible();
  });

  test('should run step with loop count multiple times', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'Loop Execution Test');
    await addBlankStep(page);

    // Expand step
    await page.getByText('Untitled Step').click();

    // Configure step with loop count = 2
    await configureStep(page, {
      name: 'Loop Exec',
      url: `${JSON_PLACEHOLDER}/posts/1`,
    });

    const loopInput = page.locator('input[type="number"][min="1"][max="100"]');
    await loopInput.clear();
    await loopInput.fill('2');

    await saveStep(page);

    // Run flow
    await runFlowAndWaitForResult(page);

    // Verify both iterations are shown in results area (1/2 and 2/2)
    const resultArea = page.locator('.border-t.border-gray-200');
    await expect(resultArea.getByText('(1/2)')).toBeVisible();
    await expect(resultArea.getByText('(2/2)')).toBeVisible();
  });

  test('should select steps with checkboxes', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'Selection Test');

    // Add two steps
    await addBlankStep(page);
    await page.getByText('Untitled Step').click();
    await configureStep(page, { name: 'Step 1', url: `${JSON_PLACEHOLDER}/posts/1` });
    await saveStep(page);

    await addBlankStep(page);
    await page.getByText('Untitled Step').click();
    await configureStep(page, { name: 'Step 2', url: `${JSON_PLACEHOLDER}/posts/2` });
    await saveStep(page);

    // Select first step using checkbox
    const checkboxes = page.locator('input[type="checkbox"]');
    await checkboxes.first().click();

    // Verify "Run Selected (1)" button appears
    await expect(page.getByRole('button', { name: /Run Selected \(1\)/ })).toBeVisible();

    // Select second step too
    await checkboxes.nth(1).click();

    // Verify "Run Selected (2)" button
    await expect(page.getByRole('button', { name: /Run Selected \(2\)/ })).toBeVisible();
  });

  test('should run only selected steps', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'Partial Run Test');

    // Add two steps
    await addBlankStep(page);
    await page.getByText('Untitled Step').click();
    await configureStep(page, { name: 'First Step', url: `${JSON_PLACEHOLDER}/posts/1` });
    await saveStep(page);

    await addBlankStep(page);
    await page.getByText('Untitled Step').click();
    await configureStep(page, { name: 'Second Step', url: `${JSON_PLACEHOLDER}/posts/2` });
    await saveStep(page);

    // Select only the second step
    const checkboxes = page.locator('input[type="checkbox"]');
    await checkboxes.nth(1).click();

    // Run selected
    await page.getByRole('button', { name: /Run Selected/ }).click();

    // Wait for results
    await expect(page.getByText('Flow Result')).toBeVisible({ timeout: 30_000 });

    // Verify only Second Step is in results (not First Step)
    const resultArea = page.locator('.border-t.border-gray-200');
    await expect(resultArea.getByText('Second Step')).toBeVisible();

    // First Step should not appear in results
    const firstStepInResults = resultArea.locator('.rounded-lg.border', { hasText: 'First Step' });
    await expect(firstStepInResults).not.toBeVisible();
  });
});
