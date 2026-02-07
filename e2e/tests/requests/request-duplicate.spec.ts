import { test, expect } from '@playwright/test';
import { cleanupAll } from '../helpers/api-cleanup';
import {
  navigateToRequests,
  createCollection,
  expandCollection,
  createRequestInCollection,
} from '../helpers/request-helpers';

test.beforeEach(async () => {
  await cleanupAll();
});

test.describe('Request Duplicate', () => {
  test('should duplicate a request within the same collection', async ({ page }) => {
    await page.goto('/');
    await navigateToRequests(page);

    await createCollection(page, 'Dup Collection');
    await expandCollection(page, 'Dup Collection');
    await createRequestInCollection(page, 'Dup Collection');

    const sidebar = page.getByRole('complementary');
    await expect(sidebar.getByText('New Request')).toBeVisible();

    // Hover over request row and click duplicate button
    const requestRow = sidebar.getByText('New Request').locator('..');
    await requestRow.getByTitle('Duplicate Request').click({ force: true });

    // Verify the copy appears in sidebar
    await expect(sidebar.getByText('New Request (Copy)')).toBeVisible();

    // Original should still exist
    await expect(sidebar.getByText('New Request').first()).toBeVisible();
  });
});
