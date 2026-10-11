/**
 * Where the API key comes from.
 *
 * Precedence:
 *   1. KOOPERATIVA_API_KEY in the environment, when it has the shape of a real key.
 *   2. The `key` field of ~/.kooperativa/config.json, written by `mcp-server login`
 *      (same file and format as the Kooperativa CLI, mode 0600).
 *
 * The environment value is ignored when it does not look like a key. Some MCP clients pass the
 * literal text of a placeholder such as ${KOOPERATIVA_API_KEY} instead of expanding it, and
 * sending that as a bearer token only produces a confusing 401.
 *
 * The key is never logged and never included in an error message.
 */

import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const CONFIG_PATH = join(homedir(), ".kooperativa", "config.json");

const KEY_SHAPE = /^(ik|kk)_live_[A-Za-z0-9_-]{16,}$/;

export function looksLikeKey(value: string | undefined): value is string {
  return typeof value === "string" && KEY_SHAPE.test(value.trim());
}

interface Stored {
  key?: string;
  base?: string;
}

function readStored(): { stored: Stored; problem?: string } {
  let raw: string;
  try {
    raw = readFileSync(CONFIG_PATH, "utf8");
  } catch {
    return { stored: {} };
  }
  try {
    return { stored: JSON.parse(raw) as Stored };
  } catch {
    return { stored: {}, problem: `${CONFIG_PATH} is not valid JSON.` };
  }
}

let warnedAboutMode = false;

function warnIfReadableByOthers() {
  if (warnedAboutMode || process.platform === "win32") return;
  try {
    if (statSync(CONFIG_PATH).mode & 0o077) {
      warnedAboutMode = true;
      console.error(
        `[kooperativa-mcp] Warning: ${CONFIG_PATH} is readable by other users. Run: chmod 600 ${CONFIG_PATH}`,
      );
    }
  } catch {
    // The file may have disappeared between the read and the stat. Nothing to warn about.
  }
}

export type KeyResolution = { key: string } | { key: null; problem: string };

export function resolveApiKey(): KeyResolution {
  const fromEnv = process.env.KOOPERATIVA_API_KEY;
  if (looksLikeKey(fromEnv)) return { key: fromEnv.trim() };

  const { stored, problem: fileProblem } = readStored();
  if (looksLikeKey(stored.key)) {
    warnIfReadableByOthers();
    return { key: stored.key.trim() };
  }

  const problems: string[] = [];
  if (fromEnv) {
    problems.push(
      "KOOPERATIVA_API_KEY is set but does not look like a Kooperativa key. Some clients do not expand placeholders such as ${KOOPERATIVA_API_KEY}.",
    );
  }
  if (fileProblem) problems.push(fileProblem);
  else if (stored.key) problems.push(`The key in ${CONFIG_PATH} does not look like a Kooperativa key.`);
  return { key: null, problem: problems.join(" ") };
}

export function missingKeyMessage(problem: string): string {
  return [
    "No Kooperativa API key found.",
    problem,
    "Run `npx -y @kooperativa_team/mcp-server login` in a terminal to store your key in",
    `${CONFIG_PATH}, or put a real key in the KOOPERATIVA_API_KEY entry of your MCP client's env block.`,
    "Get a key from https://kooperativa.io/api-keys. Never paste the key into a chat.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function saveKey(key: string): string {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true, mode: 0o700 });
  const next: Stored = { ...readStored().stored, key };
  writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
  chmodSync(CONFIG_PATH, 0o600);
  return CONFIG_PATH;
}
