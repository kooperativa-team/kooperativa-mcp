/**
 * `mcp-server login`: store the API key in ~/.kooperativa/config.json without ever putting it on
 * a command line, in shell history, or in an MCP client config.
 *
 * The key is read with echo disabled, checked against GET /me, and only then saved (mode 0600).
 * Only the account email and license state are printed, never the key.
 */

import { BASE_URL } from "./client.js";
import { CONFIG_PATH, looksLikeKey, saveKey } from "./credentials.js";

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let buffer = "";
    const finish = (value: string) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      process.stdout.write("\n");
      resolve(value);
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") return finish(buffer.trim());
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          process.stdout.write("\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") buffer = buffer.slice(0, -1);
        else buffer += ch;
      }
    };
    stdin.on("data", onData);
  });
}

export async function login(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error(
      "login needs an interactive terminal so the key can be typed without echo. Run it directly in a terminal window.",
    );
    process.exit(1);
  }

  console.log("Kooperativa API key setup. Create a key at https://kooperativa.io/api-keys.");
  const key = await promptHidden("Paste your API key (input is hidden): ");

  if (!looksLikeKey(key)) {
    console.error("That does not look like a Kooperativa key (it should start with ik_live_). Nothing was saved.");
    process.exit(1);
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/me`, { headers: { Authorization: `Bearer ${key}` } });
  } catch {
    console.error("Could not reach kooperativa.io to check the key. Check your connection. Nothing was saved.");
    process.exit(1);
  }
  if (res.status === 401) {
    console.error("The API rejected this key (401). It may be wrong or revoked. Nothing was saved.");
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`Could not verify the key (HTTP ${res.status}). Nothing was saved.`);
    process.exit(1);
  }

  const me = (await res.json().catch(() => ({}))) as {
    email?: string;
    license?: { active?: boolean };
  };
  const path = saveKey(key);
  console.log(`Key verified${me.email ? ` for ${me.email}` : ""}. License active: ${me.license?.active ? "yes" : "no"}.`);
  console.log(`Saved to ${path} (readable only by you). Restart your MCP client to pick it up.`);
  if (path !== CONFIG_PATH) console.log(`Note: expected ${CONFIG_PATH}.`);
}
