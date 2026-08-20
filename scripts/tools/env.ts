import { readFileSync } from "fs";

/**
 * Deliberately a function, called from inside a tool's gated body: loading on
 * import put a live MONGODB_URI into the worker's environment whether or not
 * the operator had asked for a live run.
 */
export function loadLocalEnv(): void {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]+?)"?\s*$/);
      if (m) process.env[m[1]] = m[2];
    }
  } catch {
    // No local env file; the tool reports the missing key itself.
  }
}
