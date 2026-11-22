import type { CompressInput, OutputParser } from "../core/types.js";

const ESLINT_ITEM_REGEX = /^\s*(\d+:\d+)\s+(error|warning)\s+(.+?)\s{2,}([@\w/-]+)\s*$/;

export const eslintParser: OutputParser = {
  name: "eslint",

  match(command: string, rawOutput: string): boolean {
    const cmd = command.toLowerCase();
    if (/\b(eslint|lint)\b/.test(cmd)) return true;
    return /✖\s+\d+\s+problems?\s+\(\d+\s+errors?,\s+\d+\s+warnings?\)/.test(rawOutput);
  },

  parse(input: CompressInput, cleanOutput: string): string {
    const lines = cleanOutput.split("\n");
    const summaryLine = lines.find((l) => /✖\s+\d+\s+problems?/.test(l))?.trim();

    if (input.exitCode === 0 && !summaryLine) {
      return "OK: 0 lint issues";
    }

    const errorsByFile = new Map<string, string[]>();
    let currentFile = "";
    let errorCount = 0;
    let warningCount = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const item = line.match(ESLINT_ITEM_REGEX);
      if (item && currentFile) {
        const [, loc, severity, msg, rule] = item;
        if (severity === "error") {
          errorCount++;
          if (!errorsByFile.has(currentFile)) errorsByFile.set(currentFile, []);
          errorsByFile.get(currentFile)!.push(`  ${loc} [${rule}] ${msg.trim()}`);
        } else {
          warningCount++;
        }
        continue;
      }

      // File path header line (no leading whitespace, looks like a path)
      if (!line.startsWith(" ") && /[/.\\]/.test(trimmed) && !trimmed.startsWith("✖")) {
        currentFile = trimmed;
      }
    }

    const out: string[] = [];
    out.push(
      summaryLine
        ? `${input.exitCode === 0 ? "WARN" : "FAIL"}: ${summaryLine.replace(/^✖\s*/, "")}`
        : `${input.exitCode === 0 ? "OK" : "FAIL"}: ${errorCount} errors, ${warningCount} warnings`
    );

    let shown = 0;
    const maxShown = 25;
    for (const [file, errs] of errorsByFile.entries()) {
      if (shown >= maxShown) break;
      out.push(file);
      for (const err of errs) {
        if (shown >= maxShown) break;
        out.push(err);
        shown++;
      }
    }

    if (errorCount > maxShown) {
      out.push(`... (${errorCount - maxShown} more errors; use inspect_log)`);
    }
    if (warningCount > 0 && errorCount > 0) {
      out.push(`(${warningCount} warnings omitted; use inspect_log to view)`);
    }

    return out.join("\n");
  },
};
