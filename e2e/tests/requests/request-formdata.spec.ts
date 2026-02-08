import { test, expect, request, type Page } from '@playwright/test';
import { cleanupAll } from '../helpers/api-cleanup';
import { API_BASE } from '../helpers/constants';
import { navigateToRequests, expandCollection, selectRequest } from '../helpers/request-helpers';

test.beforeEach(async () => {
  await cleanupAll();
});

/** Create a collection + request via API */
async function createRequestViaApi(opts: {
  name: string;
  method: string;
  url: string;
  body?: string;
  bodyType?: string;
}) {
  const ctx = await request.newContext();
  const colRes = await ctx.post(`${API_BASE}/collections`, { data: { name: 'FormData Collection' } });
  const col = await colRes.json();
  const reqRes = await ctx.post(`${API_BASE}/requests`, {
    data: { collectionId: col.id, ...opts },
  });
  const req = await reqRes.json();
  await ctx.dispose();
  return req;
}

// Body type radio order: none(0), json(1), form(2), formdata(3), raw(4), graphql(5)
const FORMDATA_RADIO_INDEX = 3;

/** Select the "Form Data" radio button in the body type selector */
async function selectFormDataBodyType(page: Page) {
  await page.locator('input[name="bodyType"]').nth(FORMDATA_RADIO_INDEX).check({ force: true });
}

/** Assert the "Form Data" radio is checked */
async function expectFormDataChecked(page: Page) {
  await expect(page.locator('input[name="bodyType"]').nth(FORMDATA_RADIO_INDEX)).toBeChecked();
}

test.describe('Form Data Body Type', () => {
  test('should show Form Data editor when selecting formdata body type', async ({ page }) => {
    await createRequestViaApi({
      name: 'FormData Test',
      method: 'POST',
      url: 'https://httpbin.org/post',
    });

    await page.goto('/');
    await navigateToRequests(page);
    await expandCollection(page, 'FormData Collection');
    await selectRequest(page, 'FormData Test');

    // Click Body tab
    await page.getByRole('button', { name: /Body/ }).click();

    // Select "Form Data" radio
    await selectFormDataBodyType(page);
    await expectFormDataChecked(page);

    // Should show "+ Add Field" button
    await expect(page.getByText('+ Add Field')).toBeVisible();
  });

  test('should add text fields and persist after save + reload', async ({ page }) => {
    await createRequestViaApi({
      name: 'FormData Persist',
      method: 'POST',
      url: 'https://httpbin.org/post',
    });

    await page.goto('/');
    await navigateToRequests(page);
    await expandCollection(page, 'FormData Collection');
    await selectRequest(page, 'FormData Persist');

    // Switch to Body > Form Data
    await page.getByRole('button', { name: /Body/ }).click();
    await selectFormDataBodyType(page);

    // Add first text field
    await page.getByText('+ Add Field').click();
    const keyInputs = page.getByPlaceholder('Field name');
    const valueInputs = page.getByPlaceholder('Value');
    await keyInputs.first().fill('username');
    await valueInputs.first().fill('testuser');

    // Add second text field
    await page.getByText('+ Add Field').click();
    await keyInputs.nth(1).fill('email');
    await valueInputs.nth(1).fill('test@example.com');

    // Save
    await page.getByRole('button', { name: 'Save' }).click();

    // Reload and verify
    await page.reload();
    await navigateToRequests(page);
    await expandCollection(page, 'FormData Collection');
    await selectRequest(page, 'FormData Persist');

    await page.getByRole('button', { name: /Body/ }).click();
    await expectFormDataChecked(page);

    // Verify fields are still there
    await expect(page.getByPlaceholder('Field name').first()).toHaveValue('username');
    await expect(page.getByPlaceholder('Value').first()).toHaveValue('testuser');
    await expect(page.getByPlaceholder('Field name').nth(1)).toHaveValue('email');
    await expect(page.getByPlaceholder('Value').nth(1)).toHaveValue('test@example.com');
  });

  test('should switch field type to File and show file picker', async ({ page }) => {
    await createRequestViaApi({
      name: 'FormData File Type',
      method: 'POST',
      url: 'https://httpbin.org/post',
    });

    await page.goto('/');
    await navigateToRequests(page);
    await expandCollection(page, 'FormData Collection');
    await selectRequest(page, 'FormData File Type');

    // Switch to Body > Form Data
    await page.getByRole('button', { name: /Body/ }).click();
    await selectFormDataBodyType(page);

    // Add a field
    await page.getByText('+ Add Field').click();

    // Default type should be Text
    const typeSelect = page.locator('select').first();
    await expect(typeSelect).toHaveValue('text');

    // Switch to File
    await typeSelect.selectOption('file');

    // Should now show "Choose File" button and "No file selected"
    await expect(page.getByRole('button', { name: 'Choose File' })).toBeVisible();
    await expect(page.getByText('No file selected')).toBeVisible();
  });

  test('should toggle field enabled/disabled', async ({ page }) => {
    await createRequestViaApi({
      name: 'FormData Toggle',
      method: 'POST',
      url: 'https://httpbin.org/post',
    });

    await page.goto('/');
    await navigateToRequests(page);
    await expandCollection(page, 'FormData Collection');
    await selectRequest(page, 'FormData Toggle');

    // Switch to Body > Form Data
    await page.getByRole('button', { name: /Body/ }).click();
    await selectFormDataBodyType(page);

    // Add a field
    await page.getByText('+ Add Field').click();
    await page.getByPlaceholder('Field name').first().fill('key1');

    // Checkbox should be checked by default
    const checkbox = page.locator('input[type="checkbox"]').first();
    await expect(checkbox).toBeChecked();

    // Uncheck it
    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();

    // The field name input should have opacity-50 class (disabled styling)
    await expect(page.getByPlaceholder('Field name').first()).toHaveClass(/opacity-50/);
  });

  test('should remove a field', async ({ page }) => {
    await createRequestViaApi({
      name: 'FormData Remove',
      method: 'POST',
      url: 'https://httpbin.org/post',
    });

    await page.goto('/');
    await navigateToRequests(page);
    await expandCollection(page, 'FormData Collection');
    await selectRequest(page, 'FormData Remove');

    // Switch to Body > Form Data
    await page.getByRole('button', { name: /Body/ }).click();
    await selectFormDataBodyType(page);

    // Add two fields
    await page.getByText('+ Add Field').click();
    await page.getByPlaceholder('Field name').first().fill('keep');
    await page.getByText('+ Add Field').click();
    await page.getByPlaceholder('Field name').nth(1).fill('remove');

    // Verify two fields exist
    await expect(page.getByPlaceholder('Field name')).toHaveCount(2);

    // Click delete button on second field (the X button)
    const deleteButtons = page.locator('button:has(svg path[d="M6 18L18 6M6 6l12 12"])');
    await deleteButtons.nth(1).click();

    // Should only have one field left
    await expect(page.getByPlaceholder('Field name')).toHaveCount(1);
    await expect(page.getByPlaceholder('Field name').first()).toHaveValue('keep');
  });

  test('should execute formdata request with text fields and get response', async ({ page }) => {
    await createRequestViaApi({
      name: 'FormData Execute',
      method: 'POST',
      url: 'https://httpbin.org/post',
    });

    await page.goto('/');
    await navigateToRequests(page);
    await expandCollection(page, 'FormData Collection');
    await selectRequest(page, 'FormData Execute');

    // Switch to Body > Form Data
    await page.getByRole('button', { name: /Body/ }).click();
    await selectFormDataBodyType(page);

    // Add a text field
    await page.getByText('+ Add Field').click();
    await page.getByPlaceholder('Field name').first().fill('greeting');
    await page.getByPlaceholder('Value').first().fill('hello');

    // Click Send
    await page.getByRole('button', { name: 'Send' }).click();

    // Wait for response
    await expect(page.getByText('200')).toBeVisible({ timeout: 30_000 });

    // httpbin.org/post returns form data in "form" field — verify in response body
    await expect(page.locator('.cm-content')).toContainText('greeting');
  });
});
