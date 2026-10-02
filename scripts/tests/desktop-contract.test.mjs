import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { createHarness, fixtureId, root } from './desktop-contract-harness.mjs';
import { createHarness as createTaskHarness, fixtureTaskId, mandatoryItemId } from './task-checklist-harness.mjs';
import { createHarness as createFacilityHarness } from './facility-harness.mjs';
const require = createRequire(import.meta.url);
const spec = require('js-yaml').load(fs.readFileSync(path.join(root, 'docs/openapi.yaml'), 'utf8'));
// Validate the JSON Schema subset used by these operations; not a full OpenAPI validator.
const ajv = new (require('ajv'))({ allErrors: true, schemaId: 'auto' });
function validateResponse(url, method, status, data) {
  const schema = spec.paths[url]?.[method]?.responses?.[status]?.content?.['application/json']?.schema;
  assert(schema, `Missing response contract: ${method} ${url} ${status}`);
  const validate = ajv.compile({ ...schema, components: spec.components });
  assert(validate(data), JSON.stringify(validate.errors));
}
async function serve(t, h) {
  const server = h.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return async (url, method = 'GET', body, roles = ['Supervisor']) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${url}`, {
      method, signal: AbortSignal.timeout(5000), headers: { 'content-type': 'application/json', ...(roles ? { authorization: `Bearer ${h.token(roles)}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: res.status, body: await res.json() };
  };
}
test('Q-01 template, preference, and notification contracts match isolated HTTP responses', async t => {
  const h = createHarness(), request = await serve(t, h);
  async function check(url, method, input, status, contractUrl = url, roles = ['Supervisor']) {
    const result = await request(url, method, input, roles);
    assert.equal(result.status, status, JSON.stringify(result.body));
    validateResponse(contractUrl, method.toLowerCase(), status, result.body);
    return result.body;
  }
  await t.test('authenticated reads include nullable template references and inactive filter semantics', async () => {
    h.reset();
    await check('/api/templates?active=true', 'GET', undefined, 200, '/api/templates', ['Viewer']);
    assert.equal(h.calls[0].inputs.activeOnly, 1);
    await check('/api/templates?active=false', 'GET', undefined, 200, '/api/templates', ['Viewer']);
    assert.equal(h.calls.at(-1).inputs.activeOnly, 0);
    await check(`/api/templates/${fixtureId}`, 'GET', undefined, 200, '/api/templates/{templateId}', ['Technician']);
  });
  await t.test('template create/update/delete success and duplicate/in-use conflicts', async () => {
    h.reset(); await check('/api/templates', 'POST', { name: 'Monthly', intervalDays: 30 }, 201);
    assert.deepEqual(h.transactions, ['begin', 'commit']);
    h.reset(); await check(`/api/templates/${fixtureId}`, 'PUT', {}, 200, '/api/templates/{templateId}');
    h.reset(); await check(`/api/templates/${fixtureId}`, 'DELETE', undefined, 200, '/api/templates/{templateId}');
    for (const method of ['POST', 'PUT']) {
      h.reset({ duplicate: true });
      await check(method === 'POST' ? '/api/templates' : `/api/templates/${fixtureId}`, method, { name: 'Duplicate', intervalDays: 30 }, 409, method === 'POST' ? '/api/templates' : '/api/templates/{templateId}');
      assert.deepEqual(h.transactions, ['begin', 'rollback']);
    }
    h.reset({ inUse: true }); await check(`/api/templates/${fixtureId}`, 'DELETE', undefined, 409, '/api/templates/{templateId}');
    assert(!h.calls.some(c => c.query.startsWith('DELETE')));
  });
  await t.test('template validation, not-found, authentication and write-role boundaries', async () => {
    h.reset(); await check('/api/templates', 'POST', { name: '', intervalDays: 0 }, 400);
    assert.equal(h.calls.length, 0);
    await check('/api/templates', 'GET', undefined, 401, '/api/templates', null);
    for (const method of ['POST', 'PUT', 'DELETE']) {
      await check(method === 'POST' ? '/api/templates' : `/api/templates/${fixtureId}`, method, {}, 403, method === 'POST' ? '/api/templates' : '/api/templates/{templateId}', ['Technician']);
    }
    h.reset({ missing: true });
    for (const method of ['GET','PUT','DELETE']) await check(`/api/templates/${fixtureId}`, method, method === 'PUT' ? {} : undefined, 404, '/api/templates/{templateId}');
  });
  await t.test('preferences document replacement semantics and validation', async () => {
    h.reset(); await check('/api/auth/me/preferences','GET',undefined,200);
    await check('/api/auth/me/preferences','PUT',{ themeMode: 'light' },200);
    assert.equal(h.calls.at(-1).inputs.themePalette, null);
    await check('/api/auth/me/preferences','PUT',{ themeMode: 'invalid' },400);
    await check('/api/auth/me/preferences','PUT',{},200);
    assert.equal(h.calls.at(-1).inputs.themeMode, null);
  });
  await t.test('notification deletion respects roles, references and missing channels', async () => {
    const url = `/api/notifications/channels/${fixtureId}`, contract = '/api/notifications/channels/{channelId}';
    h.reset(); await check(url,'DELETE',undefined,403,contract,['Supervisor']);
    h.reset({ inUse: true }); await check(url,'DELETE',undefined,409,contract,['Admin']);
    assert(!h.calls.some(c => c.query.startsWith('DELETE')));
    h.reset({ missing: true }); await check(url,'DELETE',undefined,404,contract,['Admin']);
    h.reset(); await check(url,'DELETE',undefined,200,contract,['Superadmin']);
  });
});
test('Q-01 facility detail uses null location and validates against its own contract', async t => {
  const h = createFacilityHarness(), request = await serve(t,h);
  const response = await request(`/api/facilities/${fixtureId}`,'GET',undefined,['Viewer']);
  assert.equal(response.status,200); assert.equal(response.body.location,null);
  validateResponse('/api/facilities/{facilityId}','get',200,response.body);
});
test('Q-01 task/work-order contracts preserve early failure boundaries', async t => {
  const h = createTaskHarness(), request = await serve(t,h);
  const operations = [
    ['DELETE', '/api/tasks/{taskId}'], ['DELETE','/api/work-orders/{taskId}'],
    ['POST','/api/tasks/bulk-assign-unassigned'], ['POST','/api/work-orders/{taskId}/resolution'],
    ['POST','/api/tasks/{taskId}/evidence/upload'],
    ['POST','/api/tasks/{taskId}/checklist-items/{templateChecklistItemId}/evidence/upload'],
  ];
  for (const [method,url] of operations) {
    const actual = url.replace('{taskId}',fixtureTaskId).replace('{templateChecklistItemId}',mandatoryItemId);
    const unauth = await request(actual,method,undefined,null);
    assert.equal(unauth.status,401); validateResponse(url,method.toLowerCase(),401,unauth.body);
    const invalid = await request(actual.replace(fixtureTaskId,'bad-id'),method,{},['Superadmin']);
    assert.equal(invalid.status,400); validateResponse(url,method.toLowerCase(),400,invalid.body);
  }
  h.reset();
  const forbidden = await request(`/api/work-orders/${fixtureTaskId}`,'DELETE',undefined,['Admin']);
  assert.equal(forbidden.status,403);
  validateResponse('/api/work-orders/{taskId}','delete',403,forbidden.body);
});

test('Q-01 system administration contracts with isolated provider and SQL boundaries', async t => {
  const h = createHarness(), request = await serve(t, h);
  async function check(url, method, input, status, contractUrl = url, roles = ['Admin']) {
    const result = await request(url,method,input,roles);
    assert.equal(result.status,status,JSON.stringify(result.body));
    validateResponse(contractUrl,method.toLowerCase(),status,result.body);
    return result.body;
  }
  await t.test('all newly documented administration operations reject unauthenticated calls', async () => {
    const inventory = fs.readFileSync(path.join(root,'docs/d1-boundary-review.md'),'utf8');
    const operations = [...inventory.matchAll(/^\| `(GET|POST|PUT) (\/api\/(?:system\/[^`]+|devices\/push-test))` \| Desktop caller found/gm)];
    assert.equal(operations.length,22);
    for (const [,method,url] of operations) {
      const actual = url.replace('{userId}',fixtureId).replace('{jobName}','schedule-calc');
      await check(actual,method,undefined,401,url,null);
    }
    assert.equal(h.calls.length,0);
    assert.equal(h.providerCalls.length,0);
  });
  await t.test('authenticated status and configuration reads match documented response shapes', async () => {
    h.reset();
    for (const suffix of ['status','snipeit-settings','microsoft-graph-settings','whatsapp-settings','ui-settings/assets','ui-settings/label-designer']) {
      await check(`/api/system/${suffix}`,'GET',undefined,200,`/api/system/${suffix}`,['Viewer']);
    }
    await check('/api/system/users/for-assignment','GET',undefined,200,'/api/system/users/for-assignment',['Supervisor']);
    await check('/api/system/ldap/search','GET',undefined,200);
    assert.equal(h.providerCalls.length,0);
  });
  await t.test('configuration writes preserve role distinctions and missing-schema errors', async () => {
    h.reset();
    await check('/api/system/ui-settings/assets','PUT',{visibleCategoryIds:null},403);
    await check('/api/system/ui-settings/assets','PUT',{visibleCategoryIds:null},200,'/api/system/ui-settings/assets',['Superadmin']);
    h.reset({schemaMissing:true});
    await check('/api/system/ui-settings/assets','PUT',{visibleCategoryIds:null},503,'/api/system/ui-settings/assets',['Superadmin']);
    h.reset();
    await check('/api/system/snipeit-settings','PUT',{baseUrl:null,autoSyncEnabled:false,syncIntervalMinutes:60},200);
    await check('/api/system/microsoft-graph-settings','PUT',{
      tenantId:null,clientId:null,senderEmail:null,useLoggedInUserAsSender:false,
      emailSubjectTemplate:null,emailBodyTemplate:null,enabled:false,
    },200);
    await check('/api/system/whatsapp-settings','PUT',{
      enabled:false,baseUrl:null,target:'single',defaultNumber:null,groupId:null,groupName:null,
    },200);
    assert.equal(h.providerCalls.length,0);
  });
  await t.test('provider test endpoints distinguish configuration checks from simulated calls and persistence', async () => {
    h.reset();
    await check('/api/system/snipeit-settings/test','POST',{},400);
    await check('/api/system/microsoft-graph-settings/test','POST',{},400);
    await check('/api/system/whatsapp-settings/test','POST',{baseUrl:'https://fixture.invalid'},200);
    assert.equal(h.providerCalls.length,0);
    h.reset();
    await check('/api/system/snipeit-settings/test','POST',{baseUrl:'https://fixture.invalid',apiToken:'synthetic-token'},200);
    assert.equal(h.providerCalls.length,1);
    h.reset();
    const result = await check('/api/system/microsoft-graph-settings/test','POST',{
      tenantId:'fixture-tenant',clientId:'fixture-client',clientSecret:'synthetic-secret',senderEmail:'fixture@example.invalid',scope:['https://graph.microsoft.com/.default'],sendTestEmail:false,
    },200);
    assert.equal(result.testEmailSent,false);
    assert.equal(h.providerCalls.length,1);
    assert(h.calls.some(c=>c.query.includes('INSERT INTO pm.MicrosoftGraphSettings')));
  });
  await t.test('job conflicts, import configuration, LDAP/local validation and push failures are explicit', async () => {
    h.reset({jobRunning:true});
    await check('/api/system/jobs/schedule-calc/run','POST',undefined,409,'/api/system/jobs/{jobName}/run');
    h.reset();
    await check('/api/system/jobs/schedule-calc/run','POST',undefined,200,'/api/system/jobs/{jobName}/run');
    await check('/api/system/jobs/unknown/run','POST',undefined,404,'/api/system/jobs/{jobName}/run');
    await check('/api/system/evidence-import/run','POST',{},400);
    await check('/api/system/users/local','POST',{},400);
    await check('/api/system/users/assign-ldap','POST',{},400);
    await check(`/api/system/users/${fixtureId}/refresh-ldap`,'POST',undefined,404,'/api/system/users/{userId}/refresh-ldap');
    await check('/api/devices/push-test','POST',{},400);
    h.reset({devices:true});
    const result = await check('/api/devices/push-test','POST',{title:'Fixture'},200);
    assert.equal(result.sent,1); assert.equal(h.providerCalls.length,1);
  });
});
