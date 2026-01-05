import sql from "mssql";
import { getDb } from "../db/mssql.js";

export type LogLevel = "info" | "warn" | "error";

export const writeSystemLog = async (input: {
  level: LogLevel;
  message: string;
  context?: unknown;
}): Promise<void> => {
  const db = await getDb();
  const context = input.context === undefined ? null : JSON.stringify(input.context);
  await db
    .request()
    .input("level", sql.NVarChar(16), input.level)
    .input("message", sql.NVarChar(1024), input.message)
    .input("context", sql.NVarChar(sql.MAX), context)
    .query(
      [
        "INSERT INTO pm.SystemLog (LogLevel, Message, Context)",
        "VALUES (@level, @message, @context)",
      ].join("\n"),
    );
};
