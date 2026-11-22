import type { CompressInput, OutputParser } from "../core/types.js";

/**
 * Vitest / Jest parser. Rule: never drop a failure or its reason.
 *
 * Where failures are read from:
 *   - Vitest: the detailed section after "⎯⎯ Failed Tests N ⎯⎯" (also Failed Suites /
 *     Unhandled Errors). The "×" lines in the run list above it are only names and are
 *     ignored when the detailed section exists.
 *   - Jest: the "● test name" blocks.
 *
 * Inside a failure block it keeps everything except what is safe to drop:
 *   - blank lines, ⎯⎯⎯ separators, passing-test (✓) lines
 *   - source code-frame context lines and ^ pointer lines (the Jest "> 12 |" line that
 *     points at the failing assertion is kept)
 *   - stack frames inside node_modules / node:internal (up to MAX_FRAMES others are kept)
 *
 * Every failing test is listed. Past MAX_FAILURES the rest are still named.
 */

export const MAX_FAILURES = 50;
export const MAX_BLOCK_LINES = 60;
const MAX_FRAMES = 3;

const SUMMARY_REGEX = /^(Test Files|Test Suites:|Tests:?|Snapshots:?|Duration|Time:)\s/;
const VITEST_SECTION_REGEX = /⎯{2,}.*\b(Failed Tests|Failed Suites|Unhandled Errors?)\b/;
const JEST_HEADER_REGEX = /^●\s+/;
const VITEST_HEADER_REGEX = /^(FAIL\s+|❯\s+FAIL\b)/;
const LOOSE_HEADER_REGEX = /^(FAIL\s+|×\s+|❯\s+FAIL\b|●\s+)/;

function isNoise(t: string): boolean {
  if (!t) return true;
  if (/^⎯/.test(t)) return true; // separators, incl. "⎯⎯⎯[1/16]⎯"
  if (/^[✓√]\s/.test(t)) return true; // passing tests
  if (/^\d+\s*\|/.test(t)) return true; // code-frame context "  12| code" / "12 | code"
  if (/^\|/.test(t)) return true; // pointer line "   |    ^"
  return false;
}

export const vitestJestParser: OutputParser = {
  name: "vitest-jest",

  match(command: string, rawOutput: string): boolean {
    const cmd = command.toLowerCase();
    if (/\b(vitest|jest)\b/.test(cmd)) return true;
    if (/^\s*(PASS|FAIL)\s+\S+\.(test|spec)\.[jt]sx?/m.test(rawOutput)) return true;
    if (/Test Files\s+\d+/.test(rawOutput) && /Tests\s+\d+/.test(rawOutput)) return true;
    if (/Test Suites:\s+/.test(rawOutput) && /Tests:\s+/.test(rawOutput)) return true;
    return false;
  },

  parse(input: CompressInput, cleanOutput: string): string {
    const lines = cleanOutput.split("\n");
    const summaryLines: string[] = [];

    for (const line of lines) {
      const t = line.trim();
      if (SUMMARY_REGEX.test(t) && t.length < 120 && !/^Snapshots:?\s+0 total/.test(t)) {
        summaryLines.push(t);
      }
    }

    if (input.exitCode === 0) {
      return summaryLines.length > 0 ? `PASS\n${summaryLines.join("\n")}` : "PASS (all tests succeeded)";
    }

    // Pick the section and header style that hold the detailed failures.
    const vitestStart = lines.findIndex((l) => VITEST_SECTION_REGEX.test(l));
    const jestMode = vitestStart === -1 && lines.some((l) => JEST_HEADER_REGEX.test(l.trim()));
    const startIdx = vitestStart === -1 ? 0 : vitestStart + 1;
    const headerRegex =
      vitestStart !== -1 ? VITEST_HEADER_REGEX : jestMode ? JEST_HEADER_REGEX : LOOSE_HEADER_REGEX;

    const blocks: { name: string; body: string[] }[] = [];
    let current: { name: string; body: string[]; frames: number } | null = null;

    const flush = () => {
      if (current) blocks.push({ name: current.name, body: current.body });
      current = null;
    };

    for (let i = startIdx; i < lines.length; i++) {
      const raw = lines[i];
      const t = raw.trim();

      if (headerRegex.test(t)) {
        flush();
        current = { name: t, body: [], frames: 0 };
        continue;
      }
      if (SUMMARY_REGEX.test(t) || /^Ran all test suites/.test(t)) {
        flush();
        continue;
      }
      if (!current) continue;
      const cur: { name: string; body: string[]; frames: number } = current;

      // Jest's "> 12 | expect(...)" line shows the failing assertion: keep it, shortened.
      if (/^>\s*\d+\s*\|/.test(t)) {
        cur.body.push(t.length > 160 ? `${t.slice(0, 157)}...` : t);
        continue;
      }
      if (isNoise(t)) continue;

      if (/^(at\s|❯\s)/.test(t)) {
        if (t.includes("node_modules") || t.includes("node:internal")) continue;
        if (cur.frames >= MAX_FRAMES) continue;
        cur.frames++;
        cur.body.push(t);
        continue;
      }

      // Keep the line, with Jest's 4-space block indent removed but inner indentation
      // (object diff structure) preserved.
      cur.body.push(raw.replace(/^\s{0,4}/, "").trimEnd());
    }
    flush();

    const out: string[] = [`FAIL (exit ${input.exitCode})`, ...summaryLines];

    if (blocks.length === 0) {
      const nonEmpty = lines.map((l) => l.trim()).filter((l) => l && !isNoise(l));
      out.push(...nonEmpty.slice(-30));
      return out.join("\n");
    }

    out.push("");
    blocks.slice(0, MAX_FAILURES).forEach((b) => {
      out.push(b.name);
      let body = b.body;
      if (body.length > MAX_BLOCK_LINES) {
        const extra = body.length - (MAX_BLOCK_LINES - 10);
        body = [
          ...body.slice(0, MAX_BLOCK_LINES - 15),
          `… ${extra} more lines (use inspect_log with query=<test name>)`,
          ...body.slice(-5),
        ];
      }
      for (const l of body) out.push(`  ${l}`);
    });

    if (blocks.length > MAX_FAILURES) {
      const rest = blocks.slice(MAX_FAILURES);
      out.push(
        `… ${rest.length} more failing tests (use inspect_log with query=<test name>):`,
        ...rest.map((b) => `  ${b.name}`)
      );
    }

    return out.join("\n");
  },
};
