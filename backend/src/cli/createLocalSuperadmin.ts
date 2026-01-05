import { z } from "zod";
import { ensureLocalSuperadmin } from "../db/users.js";

const ArgSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(12),
});

const parseArgs = (): z.infer<typeof ArgSchema> => {
  const args = process.argv.slice(2);

  const usernameIndex = args.findIndex((a) => a === "--username");
  const passwordIndex = args.findIndex((a) => a === "--password");

  const username = usernameIndex >= 0 ? args[usernameIndex + 1] : undefined;
  const password = passwordIndex >= 0 ? args[passwordIndex + 1] : undefined;

  const parsed = ArgSchema.safeParse({ username, password });
  if (!parsed.success) {
    process.stderr.write(
      "Usage: npm --prefix backend run create-local-superadmin -- --username <user> --password <password>\n",
    );
    process.exitCode = 2;
    throw new Error("Invalid arguments");
  }

  return parsed.data;
};

const main = async (): Promise<void> => {
  const { username, password } = parseArgs();
  await ensureLocalSuperadmin({ username, password });
  process.stdout.write(`Local superadmin ensured in DB for username: ${username}\n`);
};

await main();
