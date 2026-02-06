import { test, expect } from '@playwright/test';
import { cleanupAll } from '../helpers/api-cleanup';
import {
  navigateToRequests,
  createCollection,
  expandCollection,
  createRequestInCollection,
  selectRequest,
} from '../helpers/request-helpers';

test.beforeEach(async () => {
  await cleanupAll();
});

test.describe('Request CRUD', () => {
  test('should create a new request in a collection', async ({ page }) => {
    await page.goto('/');
    await navigateToRequests(page);

    await createCollection(page, 'API Collection');
    await expandCollection(page, 'API Collection');
    await createRequestInCollection(page, 'API Collection');

    const sidebar = page.getByRole('complementary');
    await expect(sidebar.getByText('New Request')).toBeVisible();

    // Select the newly created request
    await selectRequest(page, 'New Request');

    // Editor should show the request
    await expect(page.getByRole('heading', { name: 'New Request' })).toBeVisible();
  });

  test('should rename a request', async ({ page }) => {
    await page.goto('/');
    await navigateToRequests(page);

    await createCollection(page, 'Rename Collection');
    await expandCollection(page, 'Rename Collection');
    await createRequestInCollection(page, 'Rename Collection');

    // Select the request first
    await selectRequest(page, 'New Request');

    // Click the heading to edit name
    await page.getByRole('heading', { name: 'New Request' }).click();

    // Clear and type new name
    const nameInput = page.locator('input[type="text"]').filter({ hasText: '' }).first();
    const editInput = page.locator('.border-blue-500');
    await editInput.clear();
    await editInput.fill('Renamed Request');
    await editInput.press('Enter');

    // Save the request
    await page.getByRole('button', { name: 'Save' }).click();

    // Verify name updated in heading
    await expect(page.getByRole('heading', { name: 'Renamed Request' })).toBeVisible();

    // Verify name updated in sidebar
    const sidebar = page.getByRole('complementary');
    await expect(sidebar.getByText('Renamed Request')).toBeVisible();
  });

  test('should delete a request', async ({ page }) => {
    await page.goto('/');
    await navigateToRequests(page);

    await createCollection(page, 'Delete Req Collection');
    await expandCollection(page, 'Delete Req Collection');
    await createRequestInCollection(page, 'Delete Req Collection');

    const sidebar = page.getByRole('complementary');
    await expect(sidebar.getByText('New Request')).toBeVisible();

    // Hover over request row and click delete button (it has no title, so find trash icon button inside request row)
    const requestRow = sidebar.getByText('New Request').locator('..');
    await requestRow.locator('button').last().click({ force: true });

    await expect(sidebar.getByText('New Request')).not.toBeVisible();
  });
});
