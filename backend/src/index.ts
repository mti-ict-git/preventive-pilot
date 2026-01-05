import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { authRouter } from "./routes/auth.js";
import { assetsRouter } from "./routes/assets.js";
import { templatesRouter } from "./routes/templates.js";
import { schedulingRouter } from "./routes/scheduling.js";
import { tasksRouter } from "./routes/tasks.js";
import { reportsRouter } from "./routes/reports.js";
import { notificationsRouter } from "./routes/notifications.js";
import { systemRouter } from "./routes/system.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { startJobs } from "./jobs/index.js";

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
app.use("/api/assets", assetsRouter);
app.use("/api/templates", templatesRouter);
app.use("/api/scheduling", schedulingRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/system", systemRouter);
app.use("/api/dashboard", dashboardRouter);

app.listen(env.BACKEND_PORT, () => {
  process.stdout.write(`Backend listening on http://localhost:${env.BACKEND_PORT}\n`);
  void startJobs();
});
