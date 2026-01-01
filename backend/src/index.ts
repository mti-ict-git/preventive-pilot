import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { authRouter } from "./routes/auth";
import { assetsRouter } from "./routes/assets";
import { templatesRouter } from "./routes/templates";
import { schedulingRouter } from "./routes/scheduling";
import { tasksRouter } from "./routes/tasks";
import { reportsRouter } from "./routes/reports";
import { notificationsRouter } from "./routes/notifications";

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

app.listen(env.BACKEND_PORT, () => {
  process.stdout.write(`Backend listening on http://localhost:${env.BACKEND_PORT}\n`);
});
