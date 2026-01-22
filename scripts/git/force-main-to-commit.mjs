import { execFile } from "node:child_process";
import { promisify } from "node:util";
import process from "node:process";

const exec = promisify(execFile);

const parseArgs = () => {
  const args = process.argv.slice(2);
  let commit = "";
  let remote = "origin";
  let branch = "main";
  let dryRun = false;
  for (const a of args) {
    if (!a.startsWith("--") && !commit) {
      commit = a;
      continue;
    }
    if (a.startsWith("--remote=")) remote = a.slice("--remote=".length) || "origin";
    else if (a.startsWith("--branch=")) branch = a.slice("--branch=".length) || "main";
    else if (a === "--dry-run") dryRun = true;
  }
  return { commit, remote, branch, dryRun };
};

const run = async (cmd, args) => {
  const { stdout, stderr } = await exec(cmd, args, { windowsHide: true, shell: false });
  return { stdout, stderr };
};

const main = async () => {
  const { commit, remote, branch, dryRun } = parseArgs();
  if (!commit || !commit.trim()) {
    process.stderr.write("Commit ID is required\n");
    process.exit(1);
  }
  const inside = await run("git", ["rev-parse", "--is-inside-work-tree"]);
  if (!inside.stdout.toString().trim()) {
    process.stderr.write("Not inside a git work tree\n");
    process.exit(1);
  }
  try {
    await run("git", ["rev-parse", "--verify", commit]);
  } catch {
    process.stderr.write("Commit not found\n");
    process.exit(1);
  }
  process.stdout.write(`Target: ${commit}\n`);
  process.stdout.write(`Remote: ${remote}\n`);
  process.stdout.write(`Branch: ${branch}\n`);
  if (dryRun) {
    process.stdout.write("Dry run: no changes will be pushed\n");
  }
  await run("git", ["branch", "-f", branch, commit]);
  const head = await run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  const current = head.stdout.toString().trim();
  if (current !== branch) {
    await run("git", ["checkout", branch]);
  }
  if (!dryRun) {
    await run("git", ["push", "-f", remote, branch]);
    process.stdout.write("Origin updated\n");
  } else {
    process.stdout.write("Skipped push (dry run)\n");
  }
};

main().catch((err) => {
  const msg = err && typeof err.message === "string" ? err.message : String(err);
  process.stderr.write(`${msg}\n`);
  process.exit(1);
});

