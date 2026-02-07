import { test, expect } from '@playwright/test';
import { request as apiRequest } from '@playwright/test';
import { cleanupAll } from '../helpers/api-cleanup';
import { navigateToRequests, createCollection, expandCollection, createRequestInCollection } from '../helpers/request-helpers';
import { API_BASE } from '../helpers/constants';

test.beforeEach(async () => {
  await cleanupAll();
});

test.describe('Collection Duplicate', () => {
  test('should duplicate a collection with its requests', async ({ page }) => {
    await page.goto('/');
    await navigateToRequests(page);

    // Create a collection and add a request
    await createCollection(page, 'Original');
    await expandCollection(page, 'Original');
    await createRequestInCollection(page, 'Original');

    const sidebar = page.getByRole('complementary');
    await expect(sidebar.getByText('New Request')).toBeVisible();

    // Click duplicate button on the collection row
    const collectionRow = sidebar.getByText('Original').locator('..');
    await collectionRow.getByTitle('Duplicate Collection').click({ force: true });

    // Verify copy appears in sidebar
    await expect(sidebar.getByText('Original (Copy)')).toBeVisible();

    // Expand the copy and verify it contains the request
    await expandCollection(page, 'Original (Copy)');
    // There should now be two "New Request" entries (one in original, one in copy)
    const allNewRequests = sidebar.getByText('New Request', { exact: true });
    await expect(allNewRequests).toHaveCount(2);
  });

  test('should deep copy nested collections via API', async ({ page }) => {
    // Use API to create a nested structure, then duplicate via UI
    const ctx = await apiRequest.newContext();

    // Create Parent > Child structure with requests
    const parentRes = await ctx.post(`${API_BASE}/collections`, { data: { name: 'Parent' } });
    const parent = await parentRes.json();
    await ctx.post(`${API_BASE}/requests`, {
      data: { collectionId: parent.id, name: 'Parent Req', method: 'GET', url: 'https://example.com' },
    });

    const childRes = await ctx.post(`${API_BASE}/collections`, { data: { name: 'Child', parentId: parent.id } });
    const child = await childRes.json();
    await ctx.post(`${API_BASE}/requests`, {
      data: { collectionId: child.id, name: 'Child Req', method: 'POST', url: 'https://example.com/child' },
    });

    await ctx.dispose();

    // Navigate and duplicate via UI
    await page.goto('/');
    await navigateToRequests(page);

    const sidebar = page.getByRole('complementary');
    await expect(sidebar.getByText('Parent', { exact: true })).toBeVisible();

    // Duplicate parent collection
    const parentRow = sidebar.getByText('Parent', { exact: true }).locator('..');
    await parentRow.getByTitle('Duplicate Collection').click({ force: true });

    // Verify "Parent (Copy)" appears
    await expect(sidebar.getByText('Parent (Copy)')).toBeVisible();

    // Expand "Parent" (exact) and "Parent (Copy)"
    await sidebar.getByText('Parent', { exact: true }).click();
    await expect(sidebar.getByText('Parent Req').first()).toBeVisible();

    await sidebar.getByText('Parent (Copy)').click();
    // Both expanded → two "Parent Req" visible
    await expect(sidebar.getByText('Parent Req')).toHaveCount(2);

    // Both should have "Child" sub-collection
    await expect(sidebar.getByText('Child', { exact: true })).toHaveCount(2);

    // Expand both Child collections to verify Child Req was copied
    await sidebar.getByText('Child', { exact: true }).first().click();
    await sidebar.getByText('Child', { exact: true }).nth(1).click();
    await expect(sidebar.getByText('Child Req')).toHaveCount(2);
  });
});
