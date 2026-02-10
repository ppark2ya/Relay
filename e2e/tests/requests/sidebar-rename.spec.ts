import { test, expect } from '@playwright/test';
import { cleanupAll } from '../helpers/api-cleanup';
import {
  navigateToRequests,
  createCollection,
  expandCollection,
  createRequestInCollection,
} from '../helpers/request-helpers';
import { navigateToFlows, createFlow } from '../helpers/flow-helpers';

test.beforeEach(async () => {
  await cleanupAll();
});

test.describe('Sidebar Inline Rename - Collection', () => {
  test('should rename collection by double-clicking', async ({ page }) => {
    await page.goto('/');
    await navigateToRequests(page);
    await createCollection(page, 'Old Collection');

    const sidebar = page.getByRole('complementary');
    const nameSpan = sidebar.getByText('Old Collection');

    // Double-click to enter edit mode
    await nameSpan.dblclick();

    // Inline input should appear with current name
    const input = sidebar.locator('input.border-blue-500');
    await expect(input).toBeVisible();
    await expect(input).toHaveValue('Old Collection');

    // Type new name and press Enter
    await input.clear();
    await input.fill('Renamed Collection');
    await input.press('Enter');

    // Verify name updated in sidebar
    await expect(sidebar.getByText('Renamed Collection')).toBeVisible();
    await expect(sidebar.getByText('Old Collection')).not.toBeVisible();
  });

  test('should rename collection via pencil icon button', async ({ page }) => {
    await page.goto('/');
    await navigateToRequests(page);
    await createCollection(page, 'Icon Rename Test');

    const sidebar = page.getByRole('complementary');
    const collectionRow = sidebar.getByText('Icon Rename Test').locator('..');

    // Click the rename (pencil) button
    await collectionRow.getByTitle('Rename Collection').click({ force: true });

    // Inline input should appear
    const input = sidebar.locator('input.border-blue-500');
    await expect(input).toBeVisible();

    await input.clear();
    await input.fill('Pencil Renamed');
    await input.press('Enter');

    await expect(sidebar.getByText('Pencil Renamed')).toBeVisible();
  });

  test('should cancel collection rename on Escape', async ({ page }) => {
    await page.goto('/');
    await navigateToRequests(page);
    await createCollection(page, 'Keep This Name');

    const sidebar = page.getByRole('complementary');
    await sidebar.getByText('Keep This Name').dblclick();

    const input = sidebar.locator('input.border-blue-500');
    await input.clear();
    await input.fill('Should Not Save');
    await input.press('Escape');

    // Original name should remain
    await expect(sidebar.getByText('Keep This Name')).toBeVisible();
    await expect(sidebar.getByText('Should Not Save')).not.toBeVisible();
  });

  test('should save collection rename on blur', async ({ page }) => {
    await page.goto('/');
    await navigateToRequests(page);
    await createCollection(page, 'Blur Test');

    const sidebar = page.getByRole('complementary');
    await sidebar.getByText('Blur Test').dblclick();

    const input = sidebar.locator('input.border-blue-500');
    await input.clear();
    await input.fill('Blur Saved');

    // Click elsewhere to blur
    await page.locator('body').click();

    await expect(sidebar.getByText('Blur Saved')).toBeVisible();
  });
});

test.describe('Sidebar Inline Rename - Request', () => {
  test('should NOT have inline rename for requests (use RequestEditor instead)', async ({ page }) => {
    await page.goto('/');
    await navigateToRequests(page);
    await createCollection(page, 'No Rename Col');
    await expandCollection(page, 'No Rename Col');
    await createRequestInCollection(page, 'No Rename Col');

    const sidebar = page.getByRole('complementary');

    // Double-click should NOT enter edit mode
    await sidebar.getByText('New Request').dblclick();
    const input = sidebar.locator('input.border-blue-500');
    await expect(input).not.toBeVisible();

    // Name should still be displayed as text
    await expect(sidebar.getByText('New Request')).toBeVisible();
  });
});

test.describe('Sidebar Inline Rename - Flow', () => {
  test('should rename flow by double-clicking', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'Old Flow Name');

    const sidebar = page.getByRole('complementary');
    const flowName = sidebar.getByText('Old Flow Name');

    // Double-click to enter edit mode
    await flowName.dblclick();

    const input = sidebar.locator('input.border-blue-500');
    await expect(input).toBeVisible();
    await expect(input).toHaveValue('Old Flow Name');

    await input.clear();
    await input.fill('New Flow Name');
    await input.press('Enter');

    await expect(sidebar.getByText('New Flow Name')).toBeVisible();
    await expect(sidebar.getByText('Old Flow Name')).not.toBeVisible();
  });

  test('should cancel flow rename on Escape', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'Keep Flow Name');

    const sidebar = page.getByRole('complementary');
    await sidebar.getByText('Keep Flow Name').dblclick();

    const input = sidebar.locator('input.border-blue-500');
    await input.clear();
    await input.fill('Nope');
    await input.press('Escape');

    await expect(sidebar.getByText('Keep Flow Name')).toBeVisible();
    await expect(sidebar.getByText('Nope')).not.toBeVisible();
  });

  test('should save flow rename on blur', async ({ page }) => {
    await page.goto('/');
    await navigateToFlows(page);
    await createFlow(page, 'Flow Blur Test');

    const sidebar = page.getByRole('complementary');
    await sidebar.getByText('Flow Blur Test').dblclick();

    const input = sidebar.locator('input.border-blue-500');
    await input.clear();
    await input.fill('Flow Blur Saved');

    // Click elsewhere to blur
    await page.locator('body').click();

    await expect(sidebar.getByText('Flow Blur Saved')).toBeVisible();
  });
});
