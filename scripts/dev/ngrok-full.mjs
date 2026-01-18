import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, "../..");

const startProcess = (label, cwd, command, args) => {
  const child = spawn(command, args, {
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

const port = process.env.BACKEND_PORT && Number(process.env.BACKEND_PORT) > 0 ? String(process.env.BACKEND_PORT) : "3001";
const target = `http://localhost:${port}`;

const args = ["http"];
const token = process.env.NGROK_AUTHTOKEN;
if (typeof token === "string" && token.trim().length > 0) {
  args.push("--authtoken", token.trim());
}
args.push(target);
const ngrok = startProcess("ngrok", rootDir, "ngrok", args);
const watcher = startProcess("watcher", rootDir, "npm", ["run", "ngrok:gist-watch"]);

let shuttingDown = false;

const shutdown = (exitCode) => {
  if (shuttingDown) return;
  shuttingDown = true;
  const children = [ngrok, watcher];
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

ngrok.on("exit", (code) => {
  if (typeof code === "number") shutdown(code);
  shutdown(0);
});

watcher.on("exit", (code) => {
  if (typeof code === "number") shutdown(code);
  shutdown(0);
});

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
