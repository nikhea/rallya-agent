/**
 * Vitest setup: load rallya-agent/.env (vitest runs on node, which — unlike
 * bun — does not auto-load .env). No values are printed. CI provides the
 * same vars as real env, which take precedence over the file.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const envFile = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const s = line.trim();
    if (!s || s.startsWith("#") || !s.includes("=")) continue;
    const key = s.slice(0, s.indexOf("=")).trim();
    if (!key || process.env[key] !== undefined) continue;
    let val = s.slice(s.indexOf("=") + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}
