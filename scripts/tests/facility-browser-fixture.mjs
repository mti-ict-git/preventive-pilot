// Local browser fixture only. Real frontend + facility router; SQL and ancillary reads are fixtures.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { createHarness, express, root, fixtureId } from './facility-harness.mjs';
const h = createHarness();
const app = express();
let activeRole = "Supervisor";
app.get('/__fixture/:role', (req, res) => {
  const roles = ['Admin', 'Superadmin', 'Supervisor', 'Technician', 'Viewer'];
  if (!roles.includes(req.params.role)) return res.sendStatus(404);
  activeRole = req.params.role;
  h.reset([activeRole]);
  const token = h.token([req.params.role]);
  const target = req.query.detail === '1' ? `/facilities/${fixtureId}` : '/facilities';
  res.setHeader('Set-Cookie', `af02_fail=${req.query.fail === '1' ? '1' : '0'}; Path=/; SameSite=Strict`);
  res.type('html').send(`<script>localStorage.clear();localStorage.setItem('pm_access_token',${JSON.stringify(token)});location.replace(${JSON.stringify(target)});</script>`);
});
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.headers.cookie?.includes('af02_fail=1')) return res.status(403).json({ message: 'Fixture: permission changed. Your changes were not saved.' });
  next();
});
app.use(h.app);
app.get('/api/auth/me', (_req, res) => res.json({ user: { id: fixtureId, username: 'fixture', displayName: 'AF-02 Fixture', roles: [activeRole] } }));
app.get('/api/dashboard/overview', (_req, res) => res.json({ stats: { overdueCount: 0, dueTodayCount: 0, upcoming7DaysCount: 0 }, upcomingTasks: [], recentActivities: [] }));
app.get('/api/lookups', (_req, res) => res.json({ locations: [{ id: fixtureId, name: 'Test site' }], roles: [], categories: [] }));
app.get('/api/templates', (_req, res) => res.json({ items: [] }));
app.get('/api/tasks', (_req, res) => res.json({ items: [], page: 1, pageSize: 50 }));
app.get('/api/notifications/channels', (_req, res) => res.json({ items: [] }));
app.get('/api/*', (_req, res) => res.json({ items: [], count: 0 }));
const vite = await createServer({ configFile: false, envFile: false, root,
  define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('') },
  resolve: { alias: { '@': path.join(root, 'src') } },
  esbuild: { jsx: 'automatic' }, server: { middlewareMode: true, hmr: false }, appType: 'custom',
});
app.use(vite.middlewares);
app.use(async (req, res, next) => {
  try { res.type('html').send(await vite.transformIndexHtml(req.originalUrl, await fs.readFile(path.join(root, 'index.html'), 'utf8'))); }
  catch (err) { next(err); }
});
const server = app.listen(4179, '127.0.0.1', () => console.log('AF-02 fixture: http://127.0.0.1:4179/__fixture/Supervisor (also Admin, Superadmin, Technician, Viewer; ?detail=1 or ?fail=1)'));
const stop = async () => { await vite.close(); server.close(); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
