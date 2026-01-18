Goal

- Expose only the backend API for mobile clients to access from outside.
- Use free ngrok and handle tunnel disconnects/domain changes with automatic recovery and client notification.
Key Realities With Free Ngrok

- Ngrok auto-reconnects, but the public domain changes when the tunnel restarts.
- Mobile apps cannot be “pushed” a new API base URL unless you have a stable out-of-band channel.
- You need a stable “bootstrap” URL that the mobile app can reach to discover the current API base URL.
Recommended Approach

- Use free ngrok to tunnel the backend port only.
- Create a stable discovery endpoint outside your dev machine that always returns the current ngrok URL.
- Make mobile clients read that discovery URL at startup and periodically; when it changes, switch their API base.
Discovery Channel Options

- GitHub Gist (free): Host a public JSON with the current apiBase. Update it whenever ngrok changes.
- Firebase Remote Config (free tier): Store apiBase, mobile fetches it and updates live.
- Cloudflare Tunnel (free alternative to ngrok): Provides a stable subdomain; eliminates the rotating URL problem outright.
- Push notifications (FCM): When the tunnel changes, send a “config update” message with the new base URL; clients switch immediately.
If you want to stay with free ngrok specifically, the most straightforward path is GitHub Gist or Firebase Remote Config. Pick one as the stable “bootstrap” URL.

Backend Exposure Setup

- Run the backend locally as usual.
- Start ngrok against the backend port:
  
  ```
  ngrok http http://localhost:5056
  ```
- Keep FRONTEND_ORIGIN in your .env for web allowed origins; mobile apps using React Native fetch aren’t restricted by CORS.
Automatic Tunnel Discovery Updater

- Run a small local watcher that queries ngrok’s local API at http://127.0.0.1:4040/api/tunnels and updates your chosen discovery channel when the public URL changes.
Example watcher (Node.js), updating a generic “discovery endpoint” via POST. You can adapt this to GitHub Gist or Firebase:

```
import http from "node:http";

type TunnelInfo = {
  public_url: string;
  name: string;
  proto: string;
};

type TunnelsResponse = {
  tunnels: TunnelInfo[];
};

const NGROK_API_HOST = "127.0.0.1";
const NGROK_API_PORT = 4040;

const getCurrentPublicUrl = (): 
Promise<string> =>
  new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: NGROK_API_HOST,
        port: NGROK_API_PORT,
        method: "GET",
        path: "/api/tunnels",
        headers: { Accept: "application/
        json" },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push
        (c));
        res.on("end", () => {
          try {
            const json = JSON.parse(Buffer.
            concat(chunks).toString()) as 
            TunnelsResponse;
            const httpTunnel = json.
            tunnels.find((t) => t.proto 
            === "https");
            if (!httpTunnel) {
              reject(new Error("No HTTPS 
              tunnel found"));
              return;
            }
            resolve(httpTunnel.public_url);
          } catch (err) {
            reject(err instanceof Error ? 
            err : new Error("Failed to 
            parse tunnels response"));
          }
        });
      },
    );
    req.on("error", (err) => reject(err));
    req.end();
  });

const postDiscoveryUpdate = (apiBaseUrl: 
string): Promise<void> =>
  fetch("https://your-stable-discovery-url.
  example.com", {
    method: "POST",
    headers: { "Content-Type": 
    "application/json" },
    body: JSON.stringify({ apiBaseUrl }),
  })
    .then((res) => {
      if (!res.ok) throw new Error
      ("Discovery update failed");
    })
    .then(() => undefined);

let lastUrl: string | null = null;

const loop = async (): Promise<void> => {
  try {
    const url = await getCurrentPublicUrl
    ();
    if (url !== lastUrl) {
      await postDiscoveryUpdate(url);
      lastUrl = url;
    }
  } catch {
    /* swallow errors; try again */
  } finally {
    setTimeout(loop, 5000);
  }
};

void loop();
```
For GitHub Gist, replace postDiscoveryUpdate with a call to the Gist API to update a file like ngrok.json:
{
"apiBaseUrl": "https:// <random/>

For Firebase Remote Config, set a parameter api_base and update it with Admin SDK; mobile reads it and applies.

Mobile Client Logic (React Native)

- On app start, fetch the stable discovery URL and set the base for the API client.
- Poll periodically (e.g., every 30–60 seconds) or listen for push notifications to switch instantly.
- Retry logic: on network failure or 401 due to domain change, re-fetch discovery and retry the call.
Example ConnectionManager:

```
type ConnectionInfo = {
  apiBaseUrl: string;
};

const DISCOVERY_URL = "https://
your-stable-discovery-url.example.com/
config.json";

let currentApiBase = "";

export const getApiBase = (): string => 
currentApiBase;

export const loadConnectionInfo = async ()
: Promise<void> => {
  const res = await fetch(DISCOVERY_URL, { 
  method: "GET" });
  const json = (await res.json()) as 
  ConnectionInfo;
  currentApiBase = json.apiBaseUrl.replace
  (/\/$/, "");
};

export const startConnectionPolling = 
(intervalMs: number): void => {
  void loadConnectionInfo();
  setInterval(() => {
    void loadConnectionInfo();
  }, intervalMs);
};

export const apiFetch = async (path: 
string, init?: RequestInit): 
Promise<Response> => {
  const url = `${getApiBase()}${path}`;
  try {
    return await fetch(url, init);
  } catch {
    await loadConnectionInfo();
    return fetch(`${getApiBase()}${path}`, 
    init);
  }
};
```
Use getApiBase in your API wrapper so all calls route through the current base.

Alternative: Stable Domain With Cloudflare Tunnel

- If you can accept Cloudflare instead of ngrok, Cloudflare Tunnel offers a stable subdomain for free. This eliminates rotating URLs and the need for a discovery service. From a reliability point of view, this is the cleanest free solution for mobile clients.
Security Notes

- Keep JWT auth as-is; ngrok makes your API public, so treat it like production.
- Consider IP allowlists or Basic Auth at the ngrok edge if needed.
- Do not put tokens in the repo; pass them via environment variables.
CORS

- React Native fetch does not enforce browser CORS, so backend CORS won’t block RN calls.
- Web remains unaffected; FRONTEND_ORIGIN stays as-is.
Next Steps – Clarifications

- Are you okay to use a stable discovery URL (GitHub Gist or Firebase Remote Config), or would you prefer switching to Cloudflare Tunnel for a stable domain?
- If you pick GitHub Gist or Firebase, do you have credentials (GitHub PAT / Firebase project) we can use to automate updates from the ngrok watcher?
- Do you want us to add a small “Connection Status” screen in the mobile app (and optionally the web settings page) showing the current API base with manual refresh?
Once you confirm the discovery channel, I’ll:

- Add a tiny watcher script to monitor ngrok and update the discovery URL.
- Provide a React Native-ready ConnectionManager module wired to your choice.
- If desired, add a Settings screen showing the current connection and a refresh control.