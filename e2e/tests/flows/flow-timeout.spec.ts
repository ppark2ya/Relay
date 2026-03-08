import { test, expect, request } from '@playwright/test';
import { cleanupAll } from '../helpers/api-cleanup';
import { API_BASE, JSON_PLACEHOLDER } from '../helpers/constants';

test.beforeEach(async () => {
  await cleanupAll();
});

test.describe('Flow Timeout', () => {
  test('should complete a flow step with a JS script running longer than 5s', async () => {
    const ctx = await request.newContext();

    // Create flow
    const flowRes = await ctx.post(`${API_BASE}/flows`, {
      data: { name: 'Timeout Test', description: '' },
    });
    expect(flowRes.ok()).toBeTruthy();
    const flow = await flowRes.json();

    // Create step with a post-script that busy-waits ~6 seconds
    // This would have failed with the old 5s JS script timeout
    const postScript = `
var start = Date.now();
while (Date.now() - start < 6000) {}
pm.test("Long script completed", function() {
  pm.expect(true).to.equal(true);
});
    `.trim();

    const stepRes = await ctx.post(`${API_BASE}/flows/${flow.id}/steps`, {
      data: {
        name: 'Slow Script Step',
        method: 'GET',
        url: `${JSON_PLACEHOLDER}/posts/1`,
        stepOrder: 1,
        postScript,
      },
    });
    expect(stepRes.ok()).toBeTruthy();

    // Run flow — should succeed with the increased 30s timeout
    const runRes = await ctx.post(`${API_BASE}/flows/${flow.id}/run`, {
      data: {},
      timeout: 30_000,
    });
    expect(runRes.ok()).toBeTruthy();

    const result = await runRes.json();
    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].postScriptResult.success).toBe(true);
    expect(result.steps[0].postScriptResult.assertionsPassed).toBe(1);

    await ctx.dispose();
  });

  test('should complete a flow with multiple steps without frontend timeout', async () => {
    const ctx = await request.newContext();

    // Create flow
    const flowRes = await ctx.post(`${API_BASE}/flows`, {
      data: { name: 'Multi Step Timeout Test', description: '' },
    });
    expect(flowRes.ok()).toBeTruthy();
    const flow = await flowRes.json();

    // Create 3 steps — total execution will take several seconds
    for (let i = 1; i <= 3; i++) {
      const stepRes = await ctx.post(`${API_BASE}/flows/${flow.id}/steps`, {
        data: {
          name: `Step ${i}`,
          method: 'GET',
          url: `${JSON_PLACEHOLDER}/posts/${i}`,
          stepOrder: i,
        },
      });
      expect(stepRes.ok()).toBeTruthy();
    }

    // Run flow
    const runRes = await ctx.post(`${API_BASE}/flows/${flow.id}/run`, {
      data: {},
      timeout: 30_000,
    });
    expect(runRes.ok()).toBeTruthy();

    const result = await runRes.json();
    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(3);

    // All steps should return 200
    for (const step of result.steps) {
      expect(step.executeResult.statusCode).toBe(200);
    }

    await ctx.dispose();
  });
});
