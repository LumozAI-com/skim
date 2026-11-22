import type { CompressInput, OutputParser } from "../core/types.js";

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
        for (const e of eLines.slice(0, 4)) {
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
      out.push(...failureDetails.slice(0, 12));
      if (failureDetails.length > 12) {
        out.push(`... (${failureDetails.length - 12} more failures; use inspect_log)`);
      }
    } else if (shortFailures.length > 0) {
      out.push(...shortFailures.slice(0, 15));
    }

    return out.join("\n");
  },
};
