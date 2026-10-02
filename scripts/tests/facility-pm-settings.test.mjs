import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHarness, fixtureId, newId } from './facility-harness.mjs';

test('Facility PM partial updates distinguish omitted fields from explicit clears', async t => {
  const h = createHarness();
  const server = h.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = (body, role = 'Supervisor') => fetch(`http://127.0.0.1:${server.address().port}/api/facilities/${fixtureId}/pm-settings`, {
    method: 'PUT', signal: AbortSignal.timeout(5000),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${h.token([role])}` },
    body: JSON.stringify(body),
  });
  const cases = [
    ['toggle only preserves template and both dates', { pmEnabled: false }, 0, 0, null, null],
    ['explicit template clear resets dates', { defaultTemplateId: null }, 1, 0, null, null],
    ['template change resets omitted dates', { defaultTemplateId: newId }, 1, 0, newId, null],
    ['explicit date clear preserves omitted template', { nextPmDueAt: null }, 0, 1, null, null],
    ['date update preserves omitted template', { nextPmDueAt: '2026-10-01T00:00:00Z' }, 0, 1, null, '2026-10-01T00:00:00.000Z'],
    ['template and date can be supplied together', { defaultTemplateId: newId, nextPmDueAt: '2026-10-01T00:00:00Z' }, 1, 1, newId, '2026-10-01T00:00:00.000Z'],
  ];
  for (const [name, body, hasTemplate, hasDate, template, date] of cases) {
    await t.test(name, async () => {
      h.reset(['Supervisor']);
      const response = await request(body);
      assert.equal(response.status, 200, await response.text());
      const write = h.calls.find(c => c.query.includes('MERGE pm.FacilityPMSettings'));
      assert(write);
      assert.equal(write.inputs.hasDefaultTemplateId, hasTemplate);
      assert.equal(write.inputs.hasNextPmDueAt, hasDate);
      assert.equal(write.inputs.defaultTemplateId, template);
      assert.equal(write.inputs.nextPlannedPmDueAt?.toISOString() ?? null, date);
      assert.equal(write.inputs.nextPmDueAt?.toISOString() ?? null, date);
      // SQL is captured, not executed: ensure omitted-field branches preserve stored columns.
      assert.match(write.query, /ELSE target.DefaultTemplateId END/);
      assert.match(write.query, /ELSE target.NextPlannedPMDueAt END END/);
      assert.match(write.query, /ELSE target.NextPMDueAt END END/);
      assert(!h.calls.some(c => /UPDATE pm.PMTasks|UPDATE pm.Facilities/.test(c.query)));
    });
  }
  await t.test('empty input and technician writes remain rejected', async () => {
    h.reset(['Supervisor']);
    assert.equal((await request({})).status, 400);
    assert.equal(h.calls.length, 0);
    h.reset(['Technician']);
    assert.equal((await request({ pmEnabled: false }, 'Technician')).status, 403);
    assert(!h.calls.some(c => c.query.includes('MERGE pm.FacilityPMSettings')));
  });
});
