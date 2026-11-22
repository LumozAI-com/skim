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

export function runCompressed(
  command: string,
  options: RunCommandOptions = {}
): Promise<CompressResult> {
  const cwd = options.cwd || process.cwd();
  const timeoutMs = options.timeoutMs ?? 120_000;
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

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const exitCode = timedOut ? 124 : (code ?? 1);
      if (timedOut) {
        stderr += `\nCommand timed out after ${timeoutMs}ms`;
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
      clearTimeout(timer);
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
