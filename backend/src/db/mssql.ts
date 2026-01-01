import sql from "mssql";
import { env } from "../config/env";

const poolPromise = new sql.ConnectionPool({
  server: env.DB_SERVER,
  database: env.DB_DATABASE,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  port: env.DB_PORT,
  options: {
    encrypt: env.DB_ENCRYPT,
    trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
}).connect();

export const getDb = async () => poolPromise;

