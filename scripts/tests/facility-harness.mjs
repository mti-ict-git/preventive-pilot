// Test-only module loader: real router/auth/role middleware, deterministic DB boundary.
// Never imports backend/index.ts or config/env.ts, reads .env, or opens SQL Server.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'backend/package.json'));
export const express = require('express');
export const fixtureId = '11111111-1111-4111-8111-111111111111';
export const newId = '22222222-2222-4222-8222-222222222222';
export function createHarness() {
  const calls = [];
  let persistedRoles = [];
  let failRoles = false;
  const db = { request() {
    const inputs = {};
    return { input(key, _type, value) { inputs[key] = value; return this; }, async query(query) {
      calls.push({ query, inputs });
      if (query.includes('FROM pm.UserRoles')) {
        if (failRoles) throw new Error('Fixture role lookup unavailable');
        return { recordset: persistedRoles.map(RoleName => ({ RoleName })), rowsAffected: [] };
      }
      if (query.includes('INSERT INTO pm.Facilities')) return { recordset: [{ FacilityId: newId }], rowsAffected: [1] };
      if (query.includes('SELECT') && query.includes('FROM pm.Facilities')) return {
        recordset: [{ FacilityId: fixtureId, Name: 'Server UPS', IsActive: true, PMEnabled: true, TotalCount: 1 }], rowsAffected: [],
      };
      if (query.includes('SELECT') && query.includes('FROM pm.FacilityPMSettings')) return { recordset: [{ PMEnabled: true, DefaultTemplateId: null }], rowsAffected: [] };
      if (query.includes('UPDATE pm.Facilities') || query.includes('INTO pm.FacilityPMSettings') || query.includes('MERGE pm.FacilityPMSettings')) return { recordset: [], rowsAffected: [1] };
      throw new Error(`Unexpected fixture query: ${query}`);
    } };
  } };
  const cache = new Map();
  function load(filename) {
    const abs = path.resolve(root, filename);
    if (abs.endsWith('/config/env.ts')) return { env: { JWT_SECRET: 'af02-isolated-test-secret-only', JWT_EXPIRES_IN: '1h' } };
    if (abs.endsWith('/db/mssql.ts')) return { getDb: async () => db };
    if (cache.has(abs)) return cache.get(abs).exports;
    const module = { exports: {} }; cache.set(abs, module);
    const js = ts.transpileModule(fs.readFileSync(abs, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText;
    const localRequire = spec => spec.startsWith('.')
      ? load(path.resolve(path.dirname(abs), spec.replace(/\.js$/, '.ts')))
      : require(spec);
    vm.runInThisContext(`(function(require,module,exports){${js}\n})`, { filename: abs })(localRequire, module, module.exports);
    return module.exports;
  }
  const { facilitiesRouter } = load('backend/src/routes/facilities.ts');
  const { signAccessToken } = load('backend/src/auth/jwt.ts');
  const app = express(); app.use(express.json()); app.use('/api/facilities', facilitiesRouter);
  return {
    app, calls,
    token: roles => signAccessToken({ sub: fixtureId, username: 'fixture', roles }),
    reset(roles = [], fail = false) { calls.length = 0; persistedRoles = roles; failRoles = fail; },
  };
}
