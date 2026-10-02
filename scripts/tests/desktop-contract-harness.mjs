// Isolated router loader for Q-01. No environment file, DB connection, jobs or external providers.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'backend/package.json'));
export const fixtureId = '11111111-1111-4111-8111-111111111111';
export function createHarness(overrides = {}) {
  const calls = [], transactions = [], providerCalls = [];
  const storedSettings = new Map();
  let scenario = {};
  const template = { TemplateId: fixtureId, Name: 'Monthly inspection', Description: null, IntervalDays: 30,
    ApplicableCategoryId: null, EstimatedDurationMinutes: null, RequiredRoleId: null,
    IsActive: true, Version: 1, UpdatedAt: new Date('2026-09-27T00:00:00Z') };
  const db = { request() { const inputs = {}; return {
    input(key, _type, value) { inputs[key] = value; return this; },
    async query(query) {
      calls.push({ query, inputs });
      const result = (recordset = [], rowsAffected = []) => ({ recordset, rowsAffected });
      if (query === 'SELECT CAST(1 AS bit) AS Ok') return result([{ Ok: true }]);
      if (query.includes('FROM pm.SnipeSyncRuns')) return result();
      if (query.includes('FROM pm.SnipeItSettings')) return result(scenario.snipe ? [scenario.snipe] : []);
      if (query.includes('FROM pm.MicrosoftGraphSettings')) return result(scenario.graph ? [scenario.graph] : []);
      if (query.includes('FROM pm.SystemSettings')) return result([{ SettingValueJson: storedSettings.get(inputs.settingKey) ?? null }]);
      if (query.includes('MERGE pm.SystemSettings')) {
        if (scenario.schemaMissing) { const error = new Error('Missing schema'); error.number = 208; throw error; }
        storedSettings.set(inputs.settingKey, inputs.settingValueJson); return result([], [1]);
      }
      if (query.includes('INSERT INTO pm.SnipeItSettings')) {
        scenario.snipe = { BaseUrl: inputs.baseUrl, ApiToken: inputs.apiToken, AutoSyncEnabled: inputs.autoSyncEnabled, SyncIntervalMinutes: inputs.syncIntervalMinutes };
        return result([], [1]);
      }
      if (query.includes('INSERT INTO pm.MicrosoftGraphSettings')) {
        scenario.graph = Object.fromEntries(Object.entries(inputs).map(([k,v]) => [k[0].toUpperCase()+k.slice(1),v]));
        return result([], [1]);
      }
      if (query.includes('COUNT(1) AS Total') && query.includes('FROM pm.Users')) return result([{ Total: 0 }]);
      if (query.includes('FROM pm.Users') && query.includes('OFFSET @offset')) return result();
      if (query.includes('FROM pm.Users') && query.includes('ExternalProvider')) return result(scenario.ldapUser ? [{ Username: 'fixture', ExternalProvider: 'ldap' }] : []);
      if (query.includes('FROM pm.Devices')) return result(scenario.devices ? [{ Token: 'synthetic-token', Platform: 'web' }] : []);
      if (query.includes('FROM pm.UserRoles')) return result();
      if (query.includes('SELECT ThemeMode, ThemePalette')) return result([{ ThemeMode: 'dark', ThemePalette: null }]);
      if (query.includes('UPDATE pm.Users')) return result([], [1]);
      if (query.includes('AS HasRules')) return result([{ HasRules: scenario.inUse ? 1 : 0, HasLog: 0 }]);
      if (query.includes('DELETE FROM pm.NotificationChannels')) return result([], [scenario.missing ? 0 : 1]);
      if (query.includes('AS AssetCount')) return result([{ AssetCount: scenario.inUse ? 1 : 0, FacilityCount: 0, ScheduleCount: 0, FacilityScheduleCount: 0, TaskCount: 0 }]);
      if (query.includes('INSERT INTO pm.PMTemplates') || query.includes('UPDATE pm.PMTemplates')) {
        if (scenario.duplicate) { const error = new Error('UQ_pm_PMTemplates_Name'); error.number = 2627; throw error; }
        return result([{ TemplateId: fixtureId }], [1]);
      }
      if (query.includes('SELECT') && query.includes('FROM pm.PMTemplates')) return result(scenario.missing ? [] : [template]);
      if (query.includes('SELECT') && query.includes('FROM pm.PMTemplateChecklistItems')) return result();
      if (/^(DELETE FROM|INSERT INTO|UPDATE) pm.PMTemplate/.test(query)) return result([], [1]);
      throw new Error(`Unexpected contract fixture query: ${query}`);
    },
  }; } };
  class Transaction { async begin() { transactions.push('begin'); } request() { return db.request(); }
    async commit() { transactions.push('commit'); } async rollback() { transactions.push('rollback'); } }
  const sql = { ...require('mssql'), Transaction };
  const cache = new Map();
  function load(filename) {
    const abs = path.resolve(root, filename);
    const replacement = overrides.module?.(abs);
    if (replacement) return replacement;
    if (abs.endsWith('/config/env.ts')) return { env: { JWT_SECRET: 'q01-test-secret-only', JWT_EXPIRES_IN: '1h', JOBS_ENABLED: false, JOB_SNIPE_SYNC_ENABLED: false, JOB_SNIPE_SYNC_INTERVAL_MINUTES: 60, JOB_SCHEDULE_CALC_INTERVAL_MINUTES: 30, JOB_NOTIFICATION_INTERVAL_MINUTES: 5, MS_GRAPH_ENABLED: false, MS_GRAPH_USE_LOGGED_IN_USER_AS_SENDER: false } };
    if (abs.endsWith('/db/mssql.ts')) return { getDb: async () => db };
    if (abs.endsWith('/jobs/index.ts')) return { runJobNow: async name => { providerCalls.push({ job: name }); return !scenario.jobRunning; } };
    if (abs.endsWith('/jobs/evidenceImport.ts')) return { runEvidenceImportJob: async () => { throw new Error('Import execution not enabled in this fixture'); } };
    if (abs.endsWith('/auth/ldap.ts') || abs.endsWith('/db/users.ts')) return new Proxy({}, { get() { return () => { throw new Error('External/auth provider is outside this fixture'); }; } });
    if (cache.has(abs)) return cache.get(abs).exports;
    const module = { exports: {} }; cache.set(abs, module);
    const js = ts.transpileModule(fs.readFileSync(abs, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText;
    const localRequire = spec => {
      if (spec === 'mssql') return sql;
      if (spec === 'node:fs/promises') return { readFile: async () => '{}' };
      if (spec === 'firebase-admin/app') return { cert: () => ({}), getApps: () => [{}], initializeApp: () => ({}) };
      if (spec === 'firebase-admin/messaging') return { getMessaging: () => ({ send: async payload => { providerCalls.push({ push: payload }); return 'synthetic-message'; } }) };
      return spec.startsWith('.') ? load(path.resolve(path.dirname(abs), spec.replace(/\.js$/, '.ts'))) : require(spec);
    };
    const fakeFetch = async (url, options) => {
      providerCalls.push({ url, method: options?.method ?? 'GET' });
      return { ok: true, status: 200, json: async () => ({ access_token: 'synthetic-access-token' }), text: async () => '' };
    };
    vm.runInThisContext(`(function(require,module,exports,fetch){${js}\n})`, { filename: abs })(localRequire, module, module.exports, fakeFetch);
    return module.exports;
  }
  const app = require('express')(); app.use(require('express').json());
  for (const [file, name, prefix] of [['templates','templatesRouter','templates'],['notifications','notificationsRouter','notifications'],['auth','authRouter','auth'],['system','systemRouter','system'],['devices','devicesRouter','devices']]) {
    app.use(`/api/${prefix}`, load(`backend/src/routes/${file}.ts`)[name]);
  }
  const { signAccessToken } = load('backend/src/auth/jwt.ts');
  return { app, calls, transactions, providerCalls, token: roles => signAccessToken({ sub: fixtureId, username: 'fixture', roles }),
    reset(value = {}) { scenario = value; calls.length = 0; transactions.length = 0; providerCalls.length = 0; storedSettings.clear(); } };
}
