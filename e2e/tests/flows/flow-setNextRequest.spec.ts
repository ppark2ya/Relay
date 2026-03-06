import { test, expect, request } from '@playwright/test';
import { cleanupAll } from '../helpers/api-cleanup';
import { API_BASE, JSON_PLACEHOLDER } from '../helpers/constants';

test.beforeEach(async () => {
  await cleanupAll();
});

test.describe('Flow setNextRequest', () => {
  test('should skip steps when setNextRequest jumps forward', async () => {
    const ctx = await request.newContext();

    const flowRes = await ctx.post(`${API_BASE}/flows`, {
      data: { name: 'Goto Forward Test', description: '' },
    });
    expect(flowRes.ok()).toBeTruthy();
    const flow = await flowRes.json();

    // Step A: jumps to Step C
    await ctx.post(`${API_BASE}/flows/${flow.id}/steps`, {
      data: {
        name: 'Step A',
        method: 'GET',
        url: `${JSON_PLACEHOLDER}/posts/1`,
        stepOrder: 1,
        postScript: 'pm.execution.setNextRequest("Step C");',
      },
    });

    // Step B: should be skipped
    await ctx.post(`${API_BASE}/flows/${flow.id}/steps`, {
      data: {
        name: 'Step B',
        method: 'GET',
        url: `${JSON_PLACEHOLDER}/posts/2`,
        stepOrder: 2,
      },
    });

    // Step C: target
    await ctx.post(`${API_BASE}/flows/${flow.id}/steps`, {
      data: {
        name: 'Step C',
        method: 'GET',
        url: `${JSON_PLACEHOLDER}/posts/3`,
        stepOrder: 3,
      },
    });

    const runRes = await ctx.post(`${API_BASE}/flows/${flow.id}/run`, {
      data: {},
      timeout: 30_000,
    });
    expect(runRes.ok()).toBeTruthy();

    const result = await runRes.json();
    expect(result.success).toBe(true);

    // Should have 2 results: Step A and Step C (Step B skipped)
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].requestName).toBe('Step A');
    expect(result.steps[1].requestName).toBe('Step C');

    await ctx.dispose();
  });

  test('should repeat self via setNextRequest until condition met', async () => {
    const ctx = await request.newContext();

    const flowRes = await ctx.post(`${API_BASE}/flows`, {
      data: { name: 'Self Repeat Test', description: '' },
    });
    expect(flowRes.ok()).toBeTruthy();
    const flow = await flowRes.json();

    const postScript = `
var count = parseInt(pm.variables.get("counter") || "0") + 1;
pm.variables.set("counter", count.toString());
if (count < 3) {
    pm.execution.setNextRequest("Repeater");
} else {
    pm.execution.setNextRequest(null);
}
    `.trim();

    await ctx.post(`${API_BASE}/flows/${flow.id}/steps`, {
      data: {
        name: 'Repeater',
        method: 'GET',
        url: `${JSON_PLACEHOLDER}/posts/1`,
        stepOrder: 1,
        postScript,
      },
    });

    const runRes = await ctx.post(`${API_BASE}/flows/${flow.id}/run`, {
      data: {},
      timeout: 30_000,
    });
    expect(runRes.ok()).toBeTruthy();

    const result = await runRes.json();
    expect(result.success).toBe(true);

    // Should repeat 3 times then stop
    expect(result.steps).toHaveLength(3);
    for (const step of result.steps) {
      expect(step.requestName).toBe('Repeater');
      expect(step.executeResult.statusCode).toBe(200);
    }

    await ctx.dispose();
  });
});
