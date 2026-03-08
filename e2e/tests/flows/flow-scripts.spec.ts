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

test.describe('Flow Scripts', () => {
  test('should show Pre-Script and Post-Script fields in expanded step', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'Script Fields Test');
    await addBlankStep(page);

    // Expand step
    await page.getByText('Untitled Step').click();

    // Verify Pre-Script and Post-Script subtab buttons are visible
    await expect(page.getByRole('button', { name: 'Pre-Script' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Post-Script' })).toBeVisible();

    // Verify Continue on Error checkbox is visible
    await expect(page.getByText('Continue on Error')).toBeVisible();
  });

  test('should run flow with Post-Script assertions successfully', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'Assertion Test');
    await addBlankStep(page);

    // Expand step and configure
    await page.getByText('Untitled Step').click();
    await configureStep(page, {
      name: 'Validated Request',
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/1`,
    });

    // Switch to Post-Script subtab and fill with assertions
    await page.getByRole('button', { name: 'Post-Script' }).click();
    const postTab1 = page.getByRole('button', { name: 'Post-Script' });
    const postEditor1 = postTab1.locator('..').locator('..').locator('..').locator('.cm-content');
    await postEditor1.click();
    await postEditor1.fill(JSON.stringify({
      assertions: [
        { type: 'status', operator: 'eq', value: 200 }
      ]
    }));

    await saveStep(page);
    await runFlowAndWaitForResult(page);

    // Flow should succeed
    await expect(page.getByText('Success')).toBeVisible();
    // Should show 200 status code
    await expect(page.getByText('200', { exact: true }).first()).toBeVisible();
  });

  test('should fail flow when assertion fails', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'Assertion Fail Test');
    await addBlankStep(page);

    // Expand step and configure
    await page.getByText('Untitled Step').click();
    await configureStep(page, {
      name: 'Failing Assertion',
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/1`,
    });

    // Switch to Post-Script subtab and add wrong status assertion
    await page.getByRole('button', { name: 'Post-Script' }).click();
    const postTab2 = page.getByRole('button', { name: 'Post-Script' });
    const postEditor2 = postTab2.locator('..').locator('..').locator('..').locator('.cm-content');
    await postEditor2.click();
    await postEditor2.fill(JSON.stringify({
      assertions: [
        { type: 'status', operator: 'eq', value: 404 }
      ]
    }));

    await saveStep(page);
    await runFlowAndWaitForResult(page);

    // Should show flow failed
    await expect(page.getByText('Failed', { exact: true })).toBeVisible();
  });

  test('should continue on error when flag is enabled', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'Continue Error Test');

    // Step 1: Failing assertion but continue on error
    await addBlankStep(page);
    await page.getByText('Untitled Step').click();
    await configureStep(page, {
      name: 'Failing but Continue',
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/1`,
    });

    // Switch to Post-Script subtab and add failing assertion
    await page.getByRole('button', { name: 'Post-Script' }).click();
    const postTab3 = page.getByRole('button', { name: 'Post-Script' });
    const postEditor3 = postTab3.locator('..').locator('..').locator('..').locator('.cm-content');
    await postEditor3.click();
    await postEditor3.fill(JSON.stringify({
      assertions: [
        { type: 'status', operator: 'eq', value: 404 }
      ]
    }));

    // Enable continue on error
    await page.getByLabel('Continue on Error').check();
    await saveStep(page);

    // Step 2: Should still execute
    await addBlankStep(page);
    await page.getByText('Untitled Step').click();
    await configureStep(page, {
      name: 'Second Step',
      method: 'GET',
      url: `${JSON_PLACEHOLDER}/posts/2`,
    });
    await saveStep(page);

    await runFlowAndWaitForResult(page);

    // Both steps should have run - check for two result items
    const stepResults = page.locator('.p-3.rounded-lg.border');
    await expect(stepResults).toHaveCount(2);

    // Flow should be marked as success since continue on error was enabled
    await expect(page.getByText('Success')).toBeVisible();
  });
});
