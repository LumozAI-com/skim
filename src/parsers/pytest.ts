import type { CompressInput, OutputParser } from "../core/types.js";

/**
 * pytest parser. Rule: never drop a failure or its reason.
 * - Every "E" line of a failure is kept (up to MAX_E_LINES, then first/last lines),
 *   except the "?   ^" diff-marker lines, which only repeat the - / + lines.
 * - Every failing test is listed; past MAX_FAILURES the rest are still named.
 */
export const MAX_FAILURES = 50;
export const MAX_E_LINES = 40;

export const pytestParser: OutputParser = {
  name: "pytest",

  match(command: string, rawOutput: string): boolean {
    const cmd = command.toLowerCase();
    if (/\bpytest\b/.test(cmd)) return true;
    if (/={3,}\s*test session starts\s*={3,}/i.test(rawOutput)) return true;
    if (/={3,}\s*short test summary info\s*={3,}/i.test(rawOutput)) return true;
    return false;
  },

  parse(input: CompressInput, cleanOutput: string): string {
    const lines = cleanOutput.split("\n");

    // Final pytest summary line e.g. "=== 2 failed, 41 passed in 3.12s ==="
    const summaryLine = [...lines]
      .reverse()
      .find((l) => /^={2,}\s+.*\b(passed|failed|error|errors|skipped)\b.*={2,}$/i.test(l.trim()))
      ?.trim()
      .replace(/^=+\s*|\s*=+$/g, "");

    if (input.exitCode === 0) {
      return `PASS: ${summaryLine || "all tests passed"}`;
    }

    const out: string[] = [];
    out.push(`FAIL (exit ${input.exitCode})${summaryLine ? `: ${summaryLine}` : ""}`);

    // Prefer "short test summary info" if present
    const shortSummaryIdx = lines.findIndex((l) =>
      /={3,}\s*short test summary info\s*={3,}/i.test(l)
    );
    const shortFailures: string[] = [];
    if (shortSummaryIdx !== -1) {
      for (let i = shortSummaryIdx + 1; i < lines.length; i++) {
        const t = lines[i].trim();
        if (/^={3,}/.test(t)) break;
        if (/^(FAILED|ERROR)\s+/.test(t)) {
          shortFailures.push(t);
        }
      }
    }

    // Extract per-failure assertion details (E lines + file:line) from FAILURES section
    const failureDetails: string[] = [];
    let currentTest = "";
    let eLines: string[] = [];
    let locationLine = "";

    const flush = () => {
      if (currentTest) {
        const parts = [`- ${currentTest}`];
        if (locationLine) parts.push(`  at ${locationLine}`);
        let kept = eLines.filter((e) => !/^E\s+\?\s/.test(e) && e !== "E");
        if (kept.length > MAX_E_LINES) {
          const extra = kept.length - (MAX_E_LINES - 5);
          kept = [
            ...kept.slice(0, MAX_E_LINES - 10),
            `… ${extra} more lines (use inspect_log with query=${currentTest})`,
            ...kept.slice(-5),
          ];
        }
        for (const e of kept) {
          parts.push(`  ${e}`);
        }
        failureDetails.push(parts.join("\n"));
      }
      currentTest = "";
      eLines = [];
      locationLine = "";
    };

    for (const line of lines) {
      const trimmed = line.trim();
      const headerMatch = trimmed.match(/^_{3,}\s+(.+?)\s+_{3,}$/);
      if (headerMatch) {
        flush();
        currentTest = headerMatch[1];
        continue;
      }
      if (/^={3,}\s*(short test summary|warnings summary)/i.test(trimmed)) {
        flush();
        continue;
      }
      if (!currentTest) continue;

      if (/^E\s+/.test(trimmed)) {
        eLines.push(trimmed);
      } else if (/^[\w./\\-]+:\d+:\s+\w+/.test(trimmed)) {
        locationLine = trimmed;
      }
    }
    flush();

    if (failureDetails.length > 0) {
      out.push(...failureDetails.slice(0, MAX_FAILURES));
      if (failureDetails.length > MAX_FAILURES) {
        const rest = failureDetails.slice(MAX_FAILURES).map((d) => `  ${d.split("\n")[0].slice(2)}`);
        out.push(`… ${rest.length} more failing tests (use inspect_log with query=<test name>):`, ...rest);
      }
    } else if (shortFailures.length > 0) {
      out.push(...shortFailures);
    }

    return out.join("\n");
  },
};
