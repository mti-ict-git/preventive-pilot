import { config as loadEnv } from "dotenv";
import path from "node:path";
import { z } from "zod";

const defaultEnvPath = path.resolve(process.cwd(), "..", ".env");
loadEnv({ path: process.env.BACKEND_ENV_FILE ?? defaultEnvPath });

const booleanFromString = z
  .string()
  .transform((value) => {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
    return undefined;
  });

const numberFromString = z
  .string()
  .transform((value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  });

const EnvSchema = z.object({
  BACKEND_PORT: z.string().optional().default("3001").pipe(numberFromString).pipe(z.number()),
  FRONTEND_ORIGIN: z.string().optional().default("http://localhost:8080"),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().optional().default("8h"),

  DB_SERVER: z.string().min(1),
  DB_DATABASE: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_PORT: z.string().optional().default("1433").pipe(numberFromString).pipe(z.number()),
  DB_ENCRYPT: z.string().optional().default("false").pipe(booleanFromString).pipe(z.boolean()),
  DB_TRUST_SERVER_CERTIFICATE: z.string().optional().default("true").pipe(booleanFromString).pipe(z.boolean()),

  LDAP_URL: z.string().min(1),
  LDAP_BASE_DN: z.string().min(1),
  LDAP_BIND_DN: z.string().min(1),
  LDAP_BIND_PASSWORD: z.string().min(1),
  LDAP_USER_SEARCH_BASE: z.string().min(1),
  LDAP_USER_SEARCH_FILTER: z.string().min(1),
  LDAP_GROUP_SEARCH_BASE: z.string().min(1),
  LDAP_TIMEOUT: z.string().optional().default("5000").pipe(numberFromString).pipe(z.number()),
  LDAP_CONNECT_TIMEOUT: z.string().optional().default("10000").pipe(numberFromString).pipe(z.number()),
  LDAP_TLS_REJECT_UNAUTHORIZED: z.string().optional().default("true").pipe(booleanFromString).pipe(z.boolean()),
  LDAP_GROUP_SUPERADMIN: z.string().min(1),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);
