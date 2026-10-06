import { test, expect } from '@playwright/test';
import { API_BASE } from '../helpers/constants';
import { cleanupAll } from '../helpers/api-cleanup';

async function clearQA(request: import('@playwright/test').APIRequestContext) {
  const cases = await request.get(`${API_BASE}/qa/cases`);
  if (cases.ok()) {
    for (const qaCase of await cases.json()) await request.delete(`${API_BASE}/qa/cases/${qaCase.id}`);
  }
  const topics = await request.get(`${API_BASE}/qa/topics`);
  if (topics.ok()) {
    for (const topic of await topics.json()) await request.delete(`${API_BASE}/qa/topics/${topic.id}`);
  }
}

test.beforeEach(async ({ request }) => {
  await cleanupAll();
  await clearQA(request);
});

test('creates a QA case, links request and flow, and records its status', async ({ page, request }) => {
  const collection = await request.post(`${API_BASE}/collections`, { data: { name: 'QA API' } });
  const { id: collectionId } = await collection.json();
  const apiRequest = await request.post(`${API_BASE}/requests`, {
    data: { collectionId, name: '사용자 조회 API', method: 'GET', url: 'https://example.test/users' },
  });
  expect(apiRequest.ok()).toBeTruthy();
  const flow = await request.post(`${API_BASE}/flows`, { data: { name: '사용자 조회 Flow', description: '' } });
  expect(flow.ok()).toBeTruthy();

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const sidebar = page.getByRole('complementary');
  await sidebar.getByRole('button', { name: 'QA', exact: true }).click();
  await expect(page).toHaveURL(/\/qa$/);
  await sidebar.getByRole('button', { name: 'Collapse explorer' }).click();
  await expect(sidebar.getByRole('button', { name: 'Expand explorer' })).toBeVisible();
  await sidebar.getByRole('button', { name: 'QA', exact: true }).click();
  await expect(sidebar.getByRole('button', { name: 'Collapse explorer' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'QA 케이스', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '+ QA 케이스 추가' }).click();
  await page.locator('label').filter({ hasText: '케이스명' }).locator('input').fill('사용자 조회 정상 응답');
  await page.getByPlaceholder('새 Topic').fill('사용자 관리');
  await page.getByRole('button', { name: '추가', exact: true }).click();
  await page.locator('summary').click();
  await page.getByLabel('Request · 사용자 조회 API').check();
  await page.getByLabel('Flow · 사용자 조회 Flow').check();
  await page.getByRole('button', { name: '저장' }).click();

  await expect(page.getByText('사용자 조회 정상 응답')).toBeVisible();
  await expect(page.getByText('QA-0001')).toBeVisible();
  await page.getByText('사용자 조회 정상 응답').click();
  await page.locator('label').filter({ hasText: '상태' }).locator('select').selectOption('완료');
  await page.getByRole('button', { name: '저장' }).click();
  await expect(page.getByRole('cell', { name: '완료' })).toBeVisible();

  const qaCases = await request.get(`${API_BASE}/qa/cases`);
  const [qaCase] = await qaCases.json();
  expect(qaCase.links).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'request' }),
    expect.objectContaining({ type: 'flow' }),
  ]));
  const history = await request.get(`${API_BASE}/qa/cases/${qaCase.id}/history`);
  expect(await history.json()).toEqual(expect.arrayContaining([
    expect.objectContaining({ toStatus: '완료' }),
  ]));

  await page.screenshot({ path: 'test-results/qa-management.png', fullPage: true });
});
