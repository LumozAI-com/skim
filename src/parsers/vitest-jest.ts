import type { CompressInput, OutputParser } from "../core/types.js";

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
    const failureBlocks: string[] = [];

    // Extract summary metrics
    for (const line of lines) {
      const trimmed = line.trim();
      if (
        /^(Test Files|Test Suites|Tests|Snapshots|Duration|Time)\b/.test(trimmed) &&
        trimmed.length < 120
      ) {
        summaryLines.push(trimmed);
      }
    }

    if (input.exitCode === 0) {
      if (summaryLines.length > 0) {
        return `PASS\n${summaryLines.join("\n")}`;
      }
      return "PASS (all tests succeeded)";
    }

    // Extract failures cleanly without node_modules stack noise
    let inFailure = false;
    let currentBlock: string[] = [];
    let stackFramesKept = 0;

    const flushBlock = () => {
      if (currentBlock.length > 0) {
        failureBlocks.push(currentBlock.join("\n"));
        currentBlock = [];
      }
      stackFramesKept = 0;
    };

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();

      // New failure header (Vitest or Jest)
      if (
        /^FAIL\s+/.test(trimmed) ||
        /^●\s+/.test(trimmed) ||
        /^×\s+/.test(trimmed) ||
        /^❯\s+FAIL\b/.test(trimmed)
      ) {
        flushBlock();
        inFailure = true;
        currentBlock.push(trimmed);
        continue;
      }

      if (!inFailure) continue;

      // Stop failure section when summary starts
      if (/^(Test Files|Test Suites|Snapshots|Ran all test suites)\b/.test(trimmed)) {
        flushBlock();
        inFailure = false;
        continue;
      }

      if (!trimmed) continue;

      // Keep assertion/error lines and expected/received diffs
      if (
        /^(AssertionError|Error|TypeError|ReferenceError|RangeError|SyntaxError|Expected|Received|\-\s|\+\s|Difference:)/i.test(
          trimmed
        ) ||
        /^expect\(/.test(trimmed)
      ) {
        if (currentBlock.length < 12) {
          currentBlock.push(`  ${trimmed}`);
        }
        continue;
      }

      // Keep up to 2 non-node_modules stack frames per failure
      if (/^(at\s+|❯\s+)/.test(trimmed)) {
        if (
          !trimmed.includes("node_modules") &&
          !trimmed.includes("node:internal") &&
          stackFramesKept < 2
        ) {
          currentBlock.push(`  ${trimmed}`);
          stackFramesKept++;
        }
        continue;
      }

      // Keep concise inline code frame line with pointer (e.g. `> 42 | expect(...)`)
      if (/^>\s*\d+\s*\|/.test(trimmed) && currentBlock.length < 12) {
        currentBlock.push(`  ${trimmed}`);
      }
    }

    flushBlock();

    const out: string[] = [];
    out.push(`FAIL (exit ${input.exitCode})`);
    if (summaryLines.length > 0) {
      out.push(...summaryLines);
    }
    if (failureBlocks.length > 0) {
      out.push("");
      const maxBlocks = 10;
      out.push(...failureBlocks.slice(0, maxBlocks));
      if (failureBlocks.length > maxBlocks) {
        out.push(`... (${failureBlocks.length - maxBlocks} more failures; use inspect_log)`);
      }
    }

    return out.join("\n");
  },
};
