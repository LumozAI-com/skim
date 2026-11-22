import { spawn } from "node:child_process";
import { compressOutput } from "./registry.js";
import { generateRunId, saveRun } from "./store.js";
import { stripAnsi } from "./tokens.js";
import type { CompressResult } from "./types.js";

export interface RunCommandOptions {
  cwd?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  saveRaw?: boolean;
}

export const DEFAULT_TIMEOUT_MS = 300_000;

export function parseTimeout(value: string | number | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : undefined;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "0" || trimmed === "none" || trimmed === "off") return 0;
  const m = trimmed.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/);
  if (!m) return undefined;
  const n = Number(m[1]);
  const unit = m[2] || "ms";
  if (unit === "h") return Math.round(n * 3_600_000);
  if (unit === "m") return Math.round(n * 60_000);
  if (unit === "s") return Math.round(n * 1_000);
  return Math.round(n);
}

export function runCompressed(
  command: string,
  options: RunCommandOptions = {}
): Promise<CompressResult> {
  const cwd = options.cwd || process.cwd();
  const envTimeout = parseTimeout(process.env.SKIM_TIMEOUT_MS);
  const timeoutMs = options.timeoutMs ?? envTimeout ?? DEFAULT_TIMEOUT_MS;
  const saveRaw = options.saveRaw ?? true;

  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
          }, timeoutMs)
        : undefined;

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      const exitCode = timedOut ? 124 : (code ?? 1);
      if (timedOut) {
        stderr += `\nCommand timed out after ${timeoutMs}ms (use --timeout 0 or SKIM_TIMEOUT_MS=0 to disable)`;
      }

      const result = compressOutput({ command, stdout, stderr, exitCode });

      if (saveRaw) {
        const runId = generateRunId();
        const combinedClean = stripAnsi([stdout, stderr].filter(Boolean).join("\n"));
        saveRun({
          runId,
          command,
          cwd,
          exitCode,
          parser: result.parser,
          timestamp: new Date().toISOString(),
          rawTokens: result.rawTokens,
          compressedTokens: result.compressedTokens,
          rawLines: result.rawLines,
          rawOutput: combinedClean,
        });
        result.runId = runId;
      }

      resolve(result);
    });

    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      const result = compressOutput({
        command,
        stdout,
        stderr: `${stderr}\n${err.message}`.trim(),
        exitCode: 1,
      });
      resolve(result);
    });
  });
}

/**
 * Formats a result for the agent. The footer is kept short because it is paid
 * on every call: run id (for `skim inspect`), raw size, and exit code.
 * Token stats are left out of the footer; they are in `skim stats`.
 */
export function formatSkimOutput(result: CompressResult): string {
  if (result.passthrough) {
    return result.exitCode !== 0
      ? `${result.summary}\n[exit ${result.exitCode}]`
      : result.summary;
  }
  const parts = [result.runId ? `skim ${result.runId}` : "skim", `${result.rawLines} lines`];
  if (result.exitCode !== 0) parts.push(`exit ${result.exitCode}`);
  return `${result.summary}\n[${parts.join(" · ")}]`;
}
