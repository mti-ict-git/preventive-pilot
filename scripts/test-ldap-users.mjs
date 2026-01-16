const getArg = (name) => {
  const raw = process.argv.slice(2);
  const idx = raw.indexOf(name);
  if (idx === -1) return null;
  const v = raw[idx + 1];
  if (!v || v.startsWith("--")) return "";
  return v;
};

const hasFlag = (name) => process.argv.slice(2).includes(name);

const baseUrl = (getArg("--baseUrl") || process.env.PM_API_BASE_URL || "http://localhost:3001").replace(/\/$/, "");
const token = getArg("--token") || process.env.PM_ACCESS_TOKEN || "";

const defaultUsers = ["widji.santoso", "adhi.surahman"];
const userArgs = (() => {
  const raw = process.argv.slice(2);
  const idx = raw.indexOf("--users");
  if (idx === -1) return defaultUsers;
  const rest = raw.slice(idx + 1).filter((v) => !v.startsWith("--"));
  return rest.length ? rest : defaultUsers;
})();

const jsonOrNull = async (res) => {
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) return null;
  try {
    return (await res.json());
  } catch {
    return null;
  }
};

const requestJson = async (path, init) => {
  const headers = {
    ...(init?.headers ?? {}),
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const body = await jsonOrNull(res);
  if (!res.ok) {
    const msg =
      body && typeof body === "object" && body !== null && "message" in body && typeof body.message === "string"
        ? body.message
        : `HTTP ${res.status}`;
    throw new Error(`${path}: ${msg}`);
  }
  return body;
};

const toStringOrNull = (v) => (typeof v === "string" ? v : null);

const pickUser = (items, username) => {
  if (!Array.isArray(items)) return null;
  const target = username.trim().toLowerCase();
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const u = item;
    const itemUsername = toStringOrNull(u.username);
    if (itemUsername && itemUsername.toLowerCase() === target) return u;
  }
  return null;
};

const formatUserLine = (u) => {
  const username = toStringOrNull(u.username) ?? "";
  const displayName = toStringOrNull(u.displayName);
  const email = toStringOrNull(u.email);
  const phone = toStringOrNull(u.phone);
  const externalProvider = toStringOrNull(u.externalProvider);
  return {
    username,
    displayName,
    email,
    phone,
    externalProvider,
  };
};

const loadAllLdapUsers = async () => {
  const pageSize = 200;
  const first = await requestJson(`/api/system/users?page=1&pageSize=${pageSize}`);
  const total = typeof first === "object" && first !== null && "total" in first && typeof first.total === "number" ? first.total : Array.isArray(first?.items) ? first.items.length : 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const result = [];
  for (let page = 1; page <= pages; page++) {
    const list = await requestJson(`/api/system/users?page=${page}&pageSize=${pageSize}`);
    const items = Array.isArray(list?.items) ? list.items : [];
    for (const u of items) {
      const externalProvider = toStringOrNull(u.externalProvider);
      if (externalProvider !== "ldap") continue;
      const id = toStringOrNull(u.id);
      const username = toStringOrNull(u.username);
      if (id && username) result.push({ id, username });
    }
  }
  return result;
};

const main = async () => {
  if (!token && !hasFlag("--allow-anonymous")) {
    process.stderr.write(
      [
        "Missing token. Provide a System Admin token via one of:",
        "  - --token <JWT>",
        "  - PM_ACCESS_TOKEN=<JWT>",
        "Backend endpoints used: GET /api/system/users and POST /api/system/users/:userId/refresh-ldap.",
        "Optional flags:",
        "  - --all-ldap (process all LDAP users)",
        "\n",
      ].join("\n"),
    );
    process.exit(1);
  }

  process.stdout.write(`API base URL: ${baseUrl}\n`);
  if (hasFlag("--all-ldap")) {
    const targets = await loadAllLdapUsers();
    for (const t of targets) {
      const search = encodeURIComponent(t.username);
      const list = await requestJson(`/api/system/users?search=${search}&page=1&pageSize=50`);
      if (!list || typeof list !== "object" || !("items" in list)) {
        throw new Error("Unexpected response from /api/system/users");
      }
      const user = pickUser(list.items, t.username);
      if (!user) {
        process.stdout.write(`\n${t.username}: NOT FOUND\n`);
        continue;
      }
      const before = formatUserLine(user);
      process.stdout.write(`\n${t.username}: BEFORE\n`);
      process.stdout.write(JSON.stringify(before, null, 2) + "\n");
      await requestJson(`/api/system/users/${t.id}/refresh-ldap`, { method: "POST" });
      const listAfter = await requestJson(`/api/system/users?search=${search}&page=1&pageSize=50`);
      if (!listAfter || typeof listAfter !== "object" || !("items" in listAfter)) {
        throw new Error("Unexpected response from /api/system/users (after refresh)");
      }
      const updated = pickUser(listAfter.items, t.username);
      const after = updated ? formatUserLine(updated) : null;
      process.stdout.write(`${t.username}: AFTER\n`);
      process.stdout.write(JSON.stringify(after, null, 2) + "\n");
    }
  } else {
    for (const username of userArgs) {
      const search = encodeURIComponent(username);
      const list = await requestJson(`/api/system/users?search=${search}&page=1&pageSize=50`);
      if (!list || typeof list !== "object" || !("items" in list)) {
        throw new Error("Unexpected response from /api/system/users");
      }
      const items = list.items;
      const user = pickUser(items, username);
      if (!user) {
        process.stdout.write(`\n${username}: NOT FOUND\n`);
        continue;
      }
      const before = formatUserLine(user);
      process.stdout.write(`\n${username}: BEFORE\n`);
      process.stdout.write(JSON.stringify(before, null, 2) + "\n");
      if (before.externalProvider !== "ldap") {
        process.stdout.write(`${username}: skipped refresh (externalProvider=${before.externalProvider ?? "null"})\n`);
        continue;
      }
      const userId = toStringOrNull(user.id);
      if (!userId) {
        process.stdout.write(`${username}: missing id; cannot refresh\n`);
        continue;
      }
      await requestJson(`/api/system/users/${userId}/refresh-ldap`, { method: "POST" });
      const listAfter = await requestJson(`/api/system/users?search=${search}&page=1&pageSize=50`);
      if (!listAfter || typeof listAfter !== "object" || !("items" in listAfter)) {
        throw new Error("Unexpected response from /api/system/users (after refresh)");
      }
      const updated = pickUser(listAfter.items, username);
      const after = updated ? formatUserLine(updated) : null;
      process.stdout.write(`${username}: AFTER\n`);
      process.stdout.write(JSON.stringify(after, null, 2) + "\n");
    }
  }
};

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(message + "\n");
  process.exit(1);
});
