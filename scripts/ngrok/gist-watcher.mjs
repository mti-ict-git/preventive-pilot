
const NGROK_API_URL = process.env.NGROK_API_URL ?? "http://127.0.0.1:4040/api/tunnels";
const GITHUB_PAT = process.env.GITHUB_PAT ?? "";
const NGROK_GIST_ID = process.env.NGROK_GIST_ID ?? "";
const NGROK_GIST_FILE = process.env.NGROK_GIST_FILE ?? "ngrok.json";
const POLL_INTERVAL_MS = Number(process.env.NGROK_POLL_INTERVAL_MS ?? "5000");

const pickHttpsTunnel = (tunnels) => {
  if (!Array.isArray(tunnels)) return null;
  const https = tunnels.find((t) => typeof t === "object" && t !== null && t.proto === "https" && typeof t.public_url === "string");
  return https ? https.public_url : null;
};

const fetchTunnels = async () => {
  const res = await fetch(NGROK_API_URL, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`ngrok api failed ${res.status}`);
  const json = await res.json();
  const tunnels = typeof json === "object" && json !== null && Array.isArray(json.tunnels) ? json.tunnels : [];
  return pickHttpsTunnel(tunnels);
};

const updateGist = async (url) => {
  if (!GITHUB_PAT || !NGROK_GIST_ID) throw new Error("missing credentials");
  const body = {
    files: {
      [NGROK_GIST_FILE]: {
        content: JSON.stringify({ apiBaseUrl: url, updatedAt: new Date().toISOString() }, null, 2),
      },
    },
  };
  const res = await fetch(`https://api.github.com/gists/${encodeURIComponent(NGROK_GIST_ID)}`, {
    method: "PATCH",
    headers: {
      Authorization: `token ${GITHUB_PAT}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`gist update failed ${res.status}`);
};

let lastUrl = "";

const loop = async () => {
  try {
    const url = await fetchTunnels();
    if (url && url !== lastUrl) {
      await updateGist(url);
      lastUrl = url;
      process.stdout.write(`Updated gist with ${url}\n`);
    }
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  } finally {
    setTimeout(loop, POLL_INTERVAL_MS);
  }
};

loop();

const check = async () => {
  try {
    const res = await fetch(NGROK_API_URL, { method: "GET" });
    process.stdout.write(`ngrok api status ${res.status}\n`);
  } catch (err) {
    process.stderr.write(`ngrok api unreachable ${err instanceof Error ? err.message : String(err)}\n`);
  }
};

setInterval(() => {
  void check();
}, Math.max(3000, Math.floor(POLL_INTERVAL_MS / 2)));
