import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createHarness,
  fixtureTaskId,
  mandatoryItemId,
  passNotesItemId,
} from './task-checklist-harness.mjs';

test('TC-02 submission snapshot preserves historical checklist definitions', async t => {
  const h = createHarness();
  const server = h.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));

  const base = `http://127.0.0.1:${server.address().port}/api/tasks/${fixtureTaskId}`;
  const request = (method, suffix, body, roles) =>
    fetch(base + suffix, {
      method,
      signal: AbortSignal.timeout(5000),
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${h.token(roles)}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  await t.test('submit creates snapshot only when technician submission succeeds', async () => {
    h.reset();
    const okResponse = await request(
      'POST',
      '/submit-for-approval',
      {
        checklistResults: [
          { templateChecklistItemId: mandatoryItemId, outcome: 2, notes: 'Fail note' },
          { templateChecklistItemId: passNotesItemId, outcome: 1, notes: 'Pass note' },
        ],
      },
      ['Technician'],
    );
    assert.equal(okResponse.status, 200, await okResponse.text());
    assert(h.calls.some(call => call.query.includes('INSERT INTO pm.PMTaskChecklistSnapshots')));

    h.reset();
    const badResponse = await request(
      'POST',
      '/submit-for-approval',
      { checklistResults: [{ templateChecklistItemId: mandatoryItemId, outcome: 2 }] },
      ['Technician'],
    );
    assert.equal(badResponse.status, 400, await badResponse.text());
    assert.deepEqual(h.txEvents, ['begin', 'rollback']);
  });

  await t.test('resubmission keeps validating against the frozen snapshot instead of edited live template', async () => {
    h.reset({
      approvalStatus: 'Rejected',
      snapshotItems: [
        {
          TemplateChecklistItemId: mandatoryItemId,
          SortOrder: 5,
          ItemText: 'Frozen mandatory item',
          IsMandatory: true,
          RequiresNotes: false,
          RequiresPassFail: true,
          EnableAttachment: false,
          RequiresAttachment: false,
          IsActive: true,
          SourceTemplateVersion: 3,
          CapturedAt: new Date('2026-09-16T09:00:00Z'),
        },
      ],
      templateItems: [
        {
          TemplateChecklistItemId: mandatoryItemId,
          SortOrder: 0,
          ItemText: 'Live edited item',
          IsMandatory: true,
          RequiresNotes: true,
          RequiresPassFail: true,
          EnableAttachment: false,
          RequiresAttachment: false,
          IsActive: true,
        },
        {
          TemplateChecklistItemId: passNotesItemId,
          SortOrder: 1,
          ItemText: 'New mandatory live item',
          IsMandatory: true,
          RequiresNotes: false,
          RequiresPassFail: true,
          EnableAttachment: false,
          RequiresAttachment: false,
          IsActive: true,
        },
      ],
    });

    const response = await request(
      'POST',
      '/submit-for-approval',
      { checklistResults: [{ templateChecklistItemId: mandatoryItemId, outcome: 1 }] },
      ['Technician'],
    );
    assert.equal(response.status, 200, await response.text());
  });

  await t.test('task detail reads the frozen snapshot and reports its provenance', async () => {
    h.reset({
      approvalStatus: 'PendingSupervisor',
      snapshotItems: [
        {
          TemplateChecklistItemId: mandatoryItemId,
          SortOrder: 7,
          ItemText: 'Frozen text survives template edits',
          IsMandatory: true,
          RequiresNotes: false,
          RequiresPassFail: true,
          EnableAttachment: false,
          RequiresAttachment: false,
          IsActive: true,
          SourceTemplateVersion: 4,
          CapturedAt: new Date('2026-09-16T09:30:00Z'),
        },
      ],
      templateItems: [
        {
          TemplateChecklistItemId: mandatoryItemId,
          SortOrder: 0,
          ItemText: 'Live text should not appear',
          IsMandatory: false,
          RequiresNotes: true,
          RequiresPassFail: true,
          EnableAttachment: false,
          RequiresAttachment: false,
          IsActive: true,
        },
      ],
      checklistResults: [
        {
          TemplateChecklistItemId: mandatoryItemId,
          TaskChecklistResultId: 'snapshot-result-1',
          Outcome: 1,
          Notes: null,
          ResultCompletedAt: new Date('2026-09-16T09:35:00Z'),
          ResultCompletedByUserId: '11111111-1111-4111-8111-111111111111',
          ResultCompletedByUsername: 'fixture',
          ResultCompletedByDisplayName: 'Fixture User',
        },
      ],
    });

    const response = await request('GET', '', undefined, ['Supervisor']);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.checklistDefinitionSource, 'snapshot');
    assert.equal(body.checklistItems[0].itemText, 'Frozen text survives template edits');
    assert.equal(body.checklistItems[0].sortOrder, 7);
  });

  await t.test('legacy historical tasks without a snapshot stay explicit about the fallback source', async () => {
    h.reset({
      approvalStatus: 'PendingSupervisor',
      snapshotItems: [],
      templateItems: [
        {
          TemplateChecklistItemId: mandatoryItemId,
          SortOrder: 0,
          ItemText: 'Current template fallback',
          IsMandatory: true,
          RequiresNotes: false,
          RequiresPassFail: true,
          EnableAttachment: false,
          RequiresAttachment: false,
          IsActive: true,
        },
      ],
    });

    const response = await request('GET', '', undefined, ['Supervisor']);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.checklistDefinitionSource, 'legacy-live');
    assert.match(body.checklistDefinitionNote, /not preserved/i);
    assert.equal(body.checklistItems[0].itemText, 'Current template fallback');
  });
});
