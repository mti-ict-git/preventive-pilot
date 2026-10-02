import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'backend/package.json'));
const sql = require('mssql');
const bcrypt = require('bcryptjs');

export async function resetLocalPassword(pool, username, password) {
  if (!username?.trim() || username.length > 128) throw new Error('An exact username is required (maximum 128 characters).');
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) throw new Error('Password must contain at least 12 characters and at most 72 UTF-8 bytes.');
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await pool.request()
    .input('username', sql.NVarChar(128), username.trim())
    .input('passwordHash', sql.NVarChar(255), passwordHash)
    .query(`UPDATE c
SET PasswordHash = @passwordHash,
    PasswordUpdatedAt = sysutcdatetime(), UpdatedAt = sysutcdatetime()
OUTPUT inserted.UserId AS UserId
FROM pm.UserCredentials c
INNER JOIN pm.Users u ON u.UserId = c.UserId
WHERE u.Username = @username AND u.ExternalProvider = N'local';`);
  if (result.recordset.length !== 1) throw new Error('No existing local account with credentials matched. Check the username; LDAP passwords must be reset in the directory.');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write('Usage: npm --prefix backend run reset-local-password -- --username <exact-username> --password-stdin\nRead the new password from stdin. Existing local accounts only; no role or activation changes.\n');
    return;
  }
  if (args.length !== 3 || args[0] !== '--username' || !args[1] || args[2] !== '--password-stdin') throw new Error('Use --username <exact-username> --password-stdin. See --help.');
  if (process.stdin.isTTY) throw new Error('Pipe the password through stdin; do not pass it as a command-line argument.');
  let password = '';
  for await (const chunk of process.stdin) {
    password += chunk.toString();
    if (Buffer.byteLength(password) > 1024) throw new Error('Password input is too long.');
  }
  password = password.replace(/\r?\n$/, '');
  if (password.includes('\n') || password.includes('\r')) throw new Error('Supply one password line.');
  if (password.length < 12 || Buffer.byteLength(password) > 72) throw new Error('Password must contain at least 12 characters and at most 72 UTF-8 bytes.');
  require('dotenv').config({ path: process.env.BACKEND_ENV_FILE ?? path.join(root, '.env') });
  const env = process.env;
  for (const key of ['DB_SERVER', 'DB_DATABASE', 'DB_USER', 'DB_PASSWORD']) if (!env[key]) throw new Error(`Missing ${key}.`);
  const boolean = (value, fallback) => {
    if (value === undefined) return fallback;
    if (['true', '1', 'yes', 'y'].includes(value.toLowerCase().trim())) return true;
    if (['false', '0', 'no', 'n'].includes(value.toLowerCase().trim())) return false;
    throw new Error('Invalid database TLS boolean.');
  };
  const pool = new sql.ConnectionPool({ server: env.DB_SERVER, database: env.DB_DATABASE, user: env.DB_USER, password: env.DB_PASSWORD,
    port: Number(env.DB_PORT ?? 1433), connectionTimeout: 10000, requestTimeout: 15000,
    options: { encrypt: boolean(env.DB_ENCRYPT, false), trustServerCertificate: boolean(env.DB_TRUST_SERVER_CERTIFICATE, true) } });
  try {
    await pool.connect();
    await resetLocalPassword(pool, args[1], password);
    process.stdout.write(`Password reset for ${args[1]} on ${env.DB_SERVER}/${env.DB_DATABASE}. Existing tokens are not revoked.\n`);
  } finally { await pool.close(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // SQL driver errors can contain connection details; do not print raw driver objects.
    process.stderr.write(`${error.code ? 'Database operation failed. Check connectivity, permissions and schema.' : error.message}\n`);
    process.exitCode = 1;
  });
}
