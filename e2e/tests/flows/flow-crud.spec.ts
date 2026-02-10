import { test, expect } from '@playwright/test';
import { cleanupAll } from '../helpers/api-cleanup';
import { navigateToFlows, createFlow } from '../helpers/flow-helpers';

test.beforeEach(async () => {
  await cleanupAll();
});

test.describe('Flow CRUD', () => {
  test('should create a new flow', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'My Test Flow');

    const sidebar = page.getByRole('complementary');
    // Verify flow appears in sidebar list
    await expect(sidebar.getByText('My Test Flow')).toBeVisible();
    // Verify flow editor is shown with the name
    await expect(page.getByRole('heading', { name: 'My Test Flow' })).toBeVisible();
  });

  test('should edit flow name', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'Original Name');

    // Click h2 to enter edit mode
    await page.getByRole('heading', { name: 'Original Name' }).click();

    // Clear and type new name
    const nameInput = page.locator('input.text-lg');
    await nameInput.clear();
    await nameInput.fill('Updated Name');
    await nameInput.press('Enter');

    // Save the flow
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    // Verify name updated in sidebar
    const sidebar = page.getByRole('complementary');
    await expect(sidebar.getByText('Updated Name')).toBeVisible();
  });

  test('should edit flow description', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'Desc Test Flow');

    // Fill in description
    await page.getByPlaceholder('Add description...').fill('This is a test description');

    // Save
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    // Reload and verify description persisted
    await page.reload();
    await navigateToFlows(page);
    const sidebar = page.getByRole('complementary');
    await sidebar.getByText('Desc Test Flow').click();
    await expect(page.getByPlaceholder('Add description...')).toHaveValue('This is a test description');
  });

  test('should delete a flow', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'Flow To Delete');

    const sidebar = page.getByRole('complementary');
    // Verify flow exists in sidebar
    await expect(sidebar.getByText('Flow To Delete')).toBeVisible();

    // The flow item is a div.group containing the name and a delete button
    // The delete button is opacity-0 until hover, so we force click it
    const flowItem = sidebar.locator('.group', { hasText: 'Flow To Delete' });
    await flowItem.hover();
    await flowItem.getByTitle('Delete Flow').click({ force: true });

    // Verify flow is removed from sidebar
    await expect(sidebar.getByText('Flow To Delete')).not.toBeVisible();
  });
});
