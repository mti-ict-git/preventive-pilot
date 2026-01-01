import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { authRouter } from "./routes/auth";
import { ensureLocalSuperadmin } from "./db/users";

const app = express();

app.use(
  cors({
    origin: env.FRONTEND_ORIGIN,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);

await ensureLocalSuperadmin({
  username: env.LOCAL_SUPERADMIN_USERNAME,
  password: env.LOCAL_SUPERADMIN_PASSWORD,
});

app.listen(env.PORT, () => {
  process.stdout.write(`Backend listening on http://localhost:${env.PORT}\n`);
});

