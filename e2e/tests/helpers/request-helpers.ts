import { type Page, expect } from '@playwright/test';

/** Navigate to the Requests tab in the sidebar */
export async function navigateToRequests(page: Page) {
  await page.getByRole('button', { name: 'Requests' }).click();
}

/** Create a new collection via the sidebar UI */
export async function createCollection(page: Page, name: string) {
  await page.getByText('New Collection').click();
  await page.getByPlaceholder('Collection name').fill(name);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  // Wait for collection to appear in sidebar
  const sidebar = page.getByRole('complementary');
  await expect(sidebar.getByText(name)).toBeVisible();
}

/** Expand a collection in the sidebar (idempotent — skips if already expanded) */
export async function expandCollection(page: Page, collectionName: string) {
  const sidebar = page.getByRole('complementary');
  const row = sidebar.getByText(collectionName).locator('..');
  const arrow = row.locator('svg').first();
  const isExpanded = await arrow.evaluate(el => el.classList.contains('rotate-90'));
  if (!isExpanded) {
    await sidebar.getByText(collectionName).click();
  }
}

/** Create a new request inside a collection (collection must be expanded) */
export async function createRequestInCollection(page: Page, collectionName: string) {
  const sidebar = page.getByRole('complementary');
  // Hover over collection row then click "+" button
  const collectionRow = sidebar.getByText(collectionName).locator('..');
  await collectionRow.getByTitle('Add Request').click({ force: true });
  // Wait for "New Request" to appear in sidebar
  await expect(sidebar.getByText('New Request')).toBeVisible();
}

/** Select a request by name in the sidebar */
export async function selectRequest(page: Page, name: string) {
  const sidebar = page.getByRole('complementary');
  await sidebar.getByText(name).click();
}
