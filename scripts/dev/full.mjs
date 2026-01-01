import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, "../..");
const backendDir = path.resolve(rootDir, "backend");

const startProcess = (label, cwd, args) => {
  const child = spawn("npm", args, {
    cwd,
    stdio: "inherit",
    shell: true,
    env: { ...process.env },
    windowsHide: true,
  });
  child.on("error", (err) => {
    process.stderr.write(`[${label}] failed to start: ${String(err)}\n`);
  });
  return child;
};

const backend = startProcess("backend", backendDir, ["run", "dev"]);
const frontend = startProcess("frontend", rootDir, ["run", "dev"]);

let shuttingDown = false;

const shutdown = (exitCode) => {
  if (shuttingDown) return;
  shuttingDown = true;
  const children = [backend, frontend];
  for (const child of children) {
    if (child.pid && !child.killed) {
      if (process.platform === "win32") {
        spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
          shell: false,
          windowsHide: true,
        });
      } else {
        child.kill("SIGINT");
      }
    }
  }
  process.exit(exitCode);
};

backend.on("exit", (code) => {
  if (typeof code === "number") shutdown(code);
  shutdown(0);
});

frontend.on("exit", (code) => {
  if (typeof code === "number") shutdown(code);
  shutdown(0);
});

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
