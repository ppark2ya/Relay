import { test, expect } from '@playwright/test';
import { cleanupAll } from '../helpers/api-cleanup';
import { navigateToRequests, expandCollection } from '../helpers/request-helpers';

const collectionFixture = JSON.stringify({
  info: {
    name: 'Imported Postman Collection',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [{ key: 'BASE_URL', value: 'https://api.example.com' }],
  item: [{
    name: 'Users',
    item: [{
      name: 'Create User',
      request: {
        method: 'POST',
        url: '{{BASE_URL}}/users',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: { mode: 'raw', raw: '{"name":"Relay"}' },
      },
    }],
  }],
});

test.beforeEach(async () => {
  await cleanupAll();
});

test.describe('Postman Collection Import / Export', () => {
  test('should import a v2.1 collection and export the imported root collection', async ({ page }) => {
    await page.goto('/');
    await navigateToRequests(page);

    const sidebar = page.getByRole('complementary');
    await sidebar.locator('input[type="file"]').setInputFiles({
      name: 'collection.postman_collection.json',
      mimeType: 'application/json',
      buffer: Buffer.from(collectionFixture),
    });

    await expect(sidebar.getByText('Imported Postman Collection')).toBeVisible();
    await expandCollection(page, 'Imported Postman Collection');
    await expect(sidebar.getByText('Users')).toBeVisible();
    await expandCollection(page, 'Users');
    await expect(sidebar.getByText('Create User')).toBeVisible();

    const collectionRow = sidebar.getByText('Imported Postman Collection').locator('..');
    const downloadPromise = page.waitForEvent('download');
    await collectionRow.getByTitle('Export Postman JSON').click({ force: true });
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('Imported Postman Collection.postman_collection.json');

    const stream = await download.createReadStream();
    let contents = '';
    for await (const chunk of stream!) {
      contents += chunk;
    }
    const exported = JSON.parse(contents);
    expect(exported.info.schema).toBe('https://schema.getpostman.com/json/collection/v2.1.0/collection.json');
    expect(exported.variable).toContainEqual({ key: 'BASE_URL', value: 'https://api.example.com' });
    expect(exported.item[0].name).toBe('Users');
    expect(exported.item[0].item[0].request.method).toBe('POST');
  });
});
