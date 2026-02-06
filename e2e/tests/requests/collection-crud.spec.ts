import { test, expect } from '@playwright/test';
import { cleanupAll } from '../helpers/api-cleanup';
import { navigateToRequests, createCollection } from '../helpers/request-helpers';

test.beforeEach(async () => {
  await cleanupAll();
});

test.describe('Collection CRUD', () => {
  test('should create a new collection', async ({ page }) => {
    await page.goto('/');
    await navigateToRequests(page);

    await createCollection(page, 'My Test Collection');

    const sidebar = page.getByRole('complementary');
    await expect(sidebar.getByText('My Test Collection')).toBeVisible();
  });

  test('should delete a collection', async ({ page }) => {
    await page.goto('/');
    await navigateToRequests(page);

    await createCollection(page, 'Collection To Delete');

    const sidebar = page.getByRole('complementary');
    await expect(sidebar.getByText('Collection To Delete')).toBeVisible();

    // Hover over collection and click delete button
    const collectionRow = sidebar.getByText('Collection To Delete').locator('..');
    await collectionRow.getByTitle('Delete Collection').click({ force: true });

    await expect(sidebar.getByText('Collection To Delete')).not.toBeVisible();
  });
});
