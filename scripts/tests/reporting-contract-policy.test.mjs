import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'backend/package.json'));

const fixtureUserId = '11111111-1111-4111-8111-111111111111';

const createSqlStub = () => ({
  UniqueIdentifier: Symbol('UniqueIdentifier'),
  Int: Symbol('Int'),
  Bit: Symbol('Bit'),
  NVarChar: (...args) => ({ type: 'NVarChar', args }),
  DateTime2: (...args) => ({ type: 'DateTime2', args }),
});

function createHarness() {
  const calls = [];
  const sql = createSqlStub();
  const cache = new Map();

  const db = {
    request() {
      const inputs = {};
      return {
        input(key, _type, value) {
          inputs[key] = value;
          return this;
        },
        async query(query) {
          calls.push({ query, inputs: { ...inputs } });

          if (query.includes('COUNT(1) AS TotalDue') && query.includes('CompletedOnTime')) {
            return {
              recordset: [
                {
                  TotalDue: 4,
                  CompletedOnTime: 3,
                  CompletedTotal: 3,
                  CurrentlyOverdue: 1,
                },
              ],
              rowsAffected: [],
            };
          }

          if (query.includes('COUNT(1) AS OverdueCount') && !query.includes('OFFSET @offset')) {
            return {
              recordset: [{ OverdueCount: 2 }],
              rowsAffected: [],
            };
          }

          if (query.includes('OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY')) {
            return {
              recordset: [
                {
                  TaskId: '22222222-2222-4222-8222-222222222222',
                  TaskNumber: 'PM-0001',
                  ScheduledDueAt: '2026-09-15T08:00:00.000Z',
                  Status: 'open',
                  Priority: 'medium',
                  ContextType: 'asset',
                  AssetId: '33333333-3333-4333-8333-333333333333',
                  AssetTag: 'AST-001',
                  AssetName: 'Fixture Asset',
                  FacilityId: null,
                  FacilityName: null,
                  LocationId: '44444444-4444-4444-8444-444444444444',
                  LocationName: 'HQ',
                  CategoryId: '55555555-5555-4555-8555-555555555555',
                  CategoryName: 'UPS',
                  TemplateId: '66666666-6666-4666-8666-666666666666',
                  TemplateName: 'Monthly PM',
                },
                {
                  TaskId: '77777777-7777-4777-8777-777777777777',
                  TaskNumber: 'PM-0002',
                  ScheduledDueAt: '2026-09-14T08:00:00.000Z',
                  Status: 'open',
                  Priority: 'high',
                  ContextType: 'facility',
                  AssetId: null,
                  AssetTag: null,
                  AssetName: null,
                  FacilityId: '88888888-8888-4888-8888-888888888888',
                  FacilityName: 'Server Room',
                  LocationId: '44444444-4444-4444-8444-444444444444',
                  LocationName: 'HQ',
                  CategoryId: null,
                  CategoryName: null,
                  TemplateId: '66666666-6666-4666-8666-666666666666',
                  TemplateName: 'Monthly PM',
                },
              ],
              rowsAffected: [],
            };
          }

          if (query.includes('TaskNumber AS TaskNumber') && query.includes('ContextType')) {
            return {
              recordset: [
                {
                  TaskNumber: 'PM-0001',
                  ScheduledDueAt: '2026-09-15T08:00:00.000Z',
                  Status: 'open',
                  Priority: 'medium',
                  ContextType: 'facility',
                  AssetTag: null,
                  AssetName: null,
                  FacilityName: 'Server Room',
                  LocationName: 'HQ',
                  CategoryName: null,
                  TemplateName: 'Monthly PM',
                },
              ],
              rowsAffected: [],
            };
          }

          if (query.includes('TotalAssetsInPm')) {
            return {
              recordset: [
                {
                  TotalAssetsInPm: 5,
                  DueTodayCount: 2,
                  OverdueCount: 1,
                  Upcoming7DaysCount: 3,
                },
              ],
              rowsAffected: [],
            };
          }

          if (query.includes('WITH n AS (')) {
            return {
              recordset: [
                {
                  MonthStart: new Date('2026-09-01T00:00:00Z'),
                  MonthEnd: new Date('2026-10-01T00:00:00Z'),
                  TotalDue: 5,
                  CompletedOnTime: 4,
                },
              ],
              rowsAffected: [],
            };
          }

          if (query.includes('CategoryName') && query.includes('OverdueCount')) {
            return {
              recordset: [{ CategoryName: 'UPS', OverdueCount: 1 }],
              rowsAffected: [],
            };
          }

          if (query.includes('WITH overdue AS (')) {
            return {
              recordset: [{ AssetId: '33333333-3333-4333-8333-333333333333', AssetTag: 'AST-001', AssetName: 'Fixture Asset' }],
              rowsAffected: [],
            };
          }

          if (query.includes('t.TaskId AS TaskId') && query.includes('tpl.Name AS TemplateName')) {
            return {
              recordset: [
                {
                  TaskId: '22222222-2222-4222-8222-222222222222',
                  TaskNumber: 'PM-0001',
                  Status: 'open',
                  AssetId: '33333333-3333-4333-8333-333333333333',
                  AssetTag: 'AST-001',
                  AssetName: 'Fixture Asset',
                  ImageUrl: null,
                  TemplateName: 'Monthly PM',
                  AssignedToDisplayName: 'Fixture User',
                  AssignedToRoleName: null,
                  ScheduledDueAt: '2026-09-15T08:00:00.000Z',
                },
              ],
              rowsAffected: [],
            };
          }

          if (query.includes("AVG(DATEDIFF(SECOND, t.ReportedAt, t.CompletedAt))") && query.includes('GROUP BY ISNULL(c.Name')) {
            return {
              recordset: [{ Name: 'UPS', AvgSeconds: 7200 }],
              rowsAffected: [],
            };
          }

          if (query.includes("AVG(DATEDIFF(SECOND, t.ReportedAt, t.CompletedAt))") && query.includes('GROUP BY ISNULL(loc.Name')) {
            return {
              recordset: [{ Name: 'HQ', AvgSeconds: 7200 }],
              rowsAffected: [],
            };
          }

          if (query.includes('COUNT(1) AS IncidentCount') && query.includes('DATEFROMPARTS')) {
            return {
              recordset: [{ MonthStart: new Date('2026-09-01T00:00:00Z'), IncidentCount: 2 }],
              rowsAffected: [],
            };
          }

          if (query.includes("GROUP BY ISNULL(NULLIF(t.FailureCategory")) {
            return {
              recordset: [{ Name: 'Mechanical', Cnt: 2 }],
              rowsAffected: [],
            };
          }

          if (query.includes("GROUP BY ISNULL(NULLIF(t.ImpactLevel")) {
            return {
              recordset: [{ Name: 'high', Cnt: 2 }],
              rowsAffected: [],
            };
          }

          if (query.includes('GROUP BY ISNULL(loc.Name')) {
            return {
              recordset: [{ Name: 'HQ', Cnt: 2 }],
              rowsAffected: [],
            };
          }

          if (query.includes('GROUP BY ISNULL(c.Name')) {
            return {
              recordset: [{ Name: 'UPS', Cnt: 2 }],
              rowsAffected: [],
            };
          }

          if (query.includes('INSERT INTO pm.AuditLog')) {
            return { recordset: [], rowsAffected: [1] };
          }

          throw new Error(`Unexpected fixture query: ${query}`);
        },
      };
    },
  };

  function load(filename) {
    const abs = path.resolve(root, filename);
    if (abs.endsWith('/config/env.ts')) {
      return {
        env: {
          JWT_SECRET: 'q01-q09-reporting-test-secret',
          JWT_EXPIRES_IN: '1h',
        },
      };
    }
    if (abs.endsWith('/db/mssql.ts')) {
      return { getDb: async () => db };
    }
    if (cache.has(abs)) return cache.get(abs).exports;

    const module = { exports: {} };
    cache.set(abs, module);
    const js = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;

    const localRequire = spec => {
      if (spec === 'mssql') return sql;
      if (spec.startsWith('.')) {
        return load(path.resolve(path.dirname(abs), spec.replace(/\.js$/, '.ts')));
      }
      return require(spec);
    };

    vm.runInThisContext(`(function(require,module,exports){${js}\n})`, { filename: abs })(
      localRequire,
      module,
      module.exports,
    );
    return module.exports;
  }

  const { reportsRouter } = load('backend/src/routes/reports.ts');
  const { dashboardRouter } = load('backend/src/routes/dashboard.ts');
  const { signAccessToken } = load('backend/src/auth/jwt.ts');
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/reports', reportsRouter);
  app.use('/api/dashboard', dashboardRouter);

  return {
    app,
    calls,
    token: (roles = ['Supervisor']) => signAccessToken({ sub: fixtureUserId, username: 'fixture', roles }),
  };
}

test('Q-01/Q-09 reporting routes keep contract semantics explicit', async t => {
  const h = createHarness();
  const server = h.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));

  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (path) =>
    fetch(origin + path, {
      signal: AbortSignal.timeout(5000),
      headers: { authorization: `Bearer ${h.token()}` },
    });

  await t.test('compliance excludes cancelled work from the denominator and keeps facility location coverage', async () => {
    const response = await request(
      '/api/reports/compliance?from=2026-09-01T00:00:00.000Z&to=2026-09-30T23:59:59.000Z&locationId=44444444-4444-4444-8444-444444444444&approvedOnly=true&maintenanceType=all',
    );
    const responseText = await response.text();
    assert.equal(response.status, 200, responseText);
    const body = JSON.parse(responseText);
    assert.equal(body.totalDue, 4);

    const query = h.calls.find(call => call.query.includes('COUNT(1) AS TotalDue'))?.query ?? '';
    assert.match(query, /LEFT JOIN pm\.Facilities fac/);
    assert.match(query, /t\.CancelledAt IS NULL/);
    assert.match(query, /fac\.LocationId = @locationId/);
  });

  await t.test('overdue report exposes facility context in JSON and CSV exports', async () => {
    const response = await request('/api/reports/overdue?maintenanceType=all&page=1&pageSize=10');
    const responseText = await response.text();
    assert.equal(response.status, 200, responseText);
    const body = JSON.parse(responseText);
    assert.equal(body.overdueCount, 2);
    assert.equal(body.items[1].contextType, 'facility');
    assert.equal(body.items[1].facility.name, 'Server Room');

    const csv = await request('/api/reports/overdue/export.csv?maintenanceType=all');
    const text = await csv.text();
    assert.equal(csv.status, 200, text);
    assert.match(text, /Context Type/);
    assert.match(text, /Facility Name/);
    assert.match(text, /Server Room/);
  });

  await t.test('CM metrics keep MTTR as reported-to-completed duration', async () => {
    const response = await request('/api/reports/cm/metrics?from=2026-09-01T00:00:00.000Z&to=2026-09-30T23:59:59.000Z');
    const responseText = await response.text();
    assert.equal(response.status, 200, responseText);
    const body = JSON.parse(responseText);
    assert.equal(body.mttrByCategory[0].seconds, 7200);

    const query = h.calls.find(call => call.query.includes('AVG(DATEDIFF(SECOND, t.ReportedAt, t.CompletedAt))'))?.query ?? '';
    assert.match(query, /DATEDIFF\(SECOND, t\.ReportedAt, t\.CompletedAt\)/);
  });

  await t.test('dashboard overview keeps PM-only KPI queries', async () => {
    const response = await request('/api/dashboard/overview');
    const responseText = await response.text();
    assert.equal(response.status, 200, responseText);
    const body = JSON.parse(responseText);
    assert.equal(body.stats.dueTodayCount, 2);

    const joinedQueries = h.calls.map(call => call.query).join('\n---\n');
    assert.match(joinedQueries, /t\.MaintenanceType = N'PM'/);
  });
});
