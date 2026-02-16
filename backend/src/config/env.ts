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
  FRONTEND_ORIGIN: z.string().optional().default("http://localhost:8080,http://localhost:8081"),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().optional().default("8h"),
  REFRESH_TOKEN_EXPIRES_IN: z.string().optional().default("30d"),

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

  JOBS_ENABLED: z.string().optional().default("true").pipe(booleanFromString).pipe(z.boolean()),
  JOB_SNIPE_SYNC_ENABLED: z.string().optional().default("false").pipe(booleanFromString).pipe(z.boolean()),
  SNIPEIT_BASE_URL: z.string().optional(),
  SNIPEIT_API_TOKEN: z.string().optional(),
  JOB_SNIPE_SYNC_INTERVAL_MINUTES: z
    .string()
    .optional()
    .default("60")
    .pipe(numberFromString)
    .pipe(z.number().int().min(1)),
  JOB_SCHEDULE_CALC_INTERVAL_MINUTES: z
    .string()
    .optional()
    .default("10")
    .pipe(numberFromString)
    .pipe(z.number().int().min(1)),
  JOB_TASK_HORIZON_DAYS: z
    .string()
    .optional()
    .default("30")
    .pipe(numberFromString)
    .pipe(z.number().int().min(1)),
  PM_NOW_IDEMPOTENCY_WINDOW_MINUTES: z
    .string()
    .optional()
    .default("15")
    .pipe(numberFromString)
    .pipe(z.number().int().min(1)),
  JOB_NOTIFICATION_INTERVAL_MINUTES: z
    .string()
    .optional()
    .default("60")
    .pipe(numberFromString)
    .pipe(z.number().int().min(1)),

  JOB_EVIDENCE_IMPORT_ENABLED: z.string().optional().default("false").pipe(booleanFromString).pipe(z.boolean()),
  JOB_EVIDENCE_IMPORT_INTERVAL_MINUTES: z
    .string()
    .optional()
    .default("60")
    .pipe(numberFromString)
    .pipe(z.number().int().min(1)),

  EVIDENCE_IMPORT_ROOT: z.string().optional(),
  EVIDENCE_STORAGE_ROOT: z.string().optional(),
  EVIDENCE_IMPORT_MAX_FILES: z.string().optional().default("2000").pipe(numberFromString).pipe(z.number().int().min(1)),

  MS_GRAPH_TENANT_ID: z.string().optional(),
  MS_GRAPH_CLIENT_ID: z.string().optional(),
  MS_GRAPH_CLIENT_SECRET: z.string().optional(),
  MS_GRAPH_SCOPE: z.string().optional(),
  MS_GRAPH_SENDER_EMAIL: z.string().optional(),
  MS_GRAPH_DEFAULT_TO: z.string().optional(),
  MS_GRAPH_DEFAULT_CC: z.string().optional(),
  MS_GRAPH_DEFAULT_BCC: z.string().optional(),
  MS_GRAPH_EMAIL_SUBJECT_TEMPLATE: z.string().optional(),
  MS_GRAPH_EMAIL_BODY_TEMPLATE: z.string().optional(),
  MS_GRAPH_USE_LOGGED_IN_USER_AS_SENDER: z.string().optional().default("true").pipe(booleanFromString).pipe(z.boolean()),
  MS_GRAPH_ENABLED: z.string().optional().default("false").pipe(booleanFromString).pipe(z.boolean()),
  FCM_SERVER_KEY: z.string().optional(),

  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_JSON_BASE64: z.string().optional(),

  APP_UPDATE_STORAGE_ROOT: z.string().optional(),
  APP_UPDATE_CONFIG_JSON: z.string().optional(),
  APP_UPDATE_SIGNING_SECRET: z.string().optional(),
  APP_UPDATE_STORE_BASE_URL: z.string().optional(),
  APP_UPDATE_STORE_MANIFEST_URL: z.string().optional(),
  APP_UPDATE_STORE_ALLOW_HTTP: z.string().optional().default("false").pipe(booleanFromString).pipe(z.boolean()),
  APP_UPDATE_TOKEN_TTL_SECONDS: z.string().optional().default("600").pipe(numberFromString).pipe(z.number().int().min(60).max(86400)),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);
