import type { CompressInput, OutputParser } from "../core/types.js";

/**
 * ESLint parser (stylish formatter). Rule: never drop an error.
 *
 * - Every error is shown, grouped by file with a count. Identical messages from the
 *   same rule in one file are merged into one line with all their locations.
 * - Messages without a rule name (e.g. "Parsing error: ...") are kept.
 * - The common directory prefix of all file paths is stated once and stripped.
 * - Warnings: when there are errors, warnings are summarized per rule with the files
 *   they are in (so nothing is invisible). When there are only warnings, they are shown
 *   in full like errors.
 * - Past MAX_ERRORS, the remaining files are still named with their counts.
 */

export const MAX_ERRORS = 150;

const ESLINT_ITEM_REGEX = /^\s*(\d+:\d+)\s+(error|warning)\s+(.+?)(?:\s{2,}([@\w/.-]+))?\s*$/;

interface Item {
  loc: string;
  msg: string;
  rule: string;
}

function commonDir(paths: string[]): string {
  if (paths.length === 0) return "";
  const split = paths.map((p) => p.split("/"));
  const first = split[0];
  let n = first.length - 1; // never include the file name itself
  for (const parts of split.slice(1)) {
    let i = 0;
    while (i < n && i < parts.length - 1 && parts[i] === first[i]) i++;
    n = i;
  }
  const dir = first.slice(0, n).join("/");
  return dir.length > 1 ? `${dir}/` : "";
}

function renderFile(items: Item[]): string[] {
  const merged = new Map<string, { locs: string[]; item: Item }>();
  for (const it of items) {
    const key = `${it.rule}\u0000${it.msg}`;
    if (merged.has(key)) merged.get(key)!.locs.push(it.loc);
    else merged.set(key, { locs: [it.loc], item: it });
  }
  return [...merged.values()].map(
    ({ locs, item }) => `  ${locs.join(", ")}${item.rule ? ` [${item.rule}]` : ""} ${item.msg}`
  );
}

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
    const fixableLine = lines.find((l) => /potentially fixable with the `--fix` option/.test(l))?.trim();

    if (input.exitCode === 0 && !summaryLine) {
      return "OK: 0 lint issues";
    }

    const errors = new Map<string, Item[]>();
    const warnings = new Map<string, Item[]>();
    let currentFile = "";
    let errorCount = 0;
    let warningCount = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const m = line.match(ESLINT_ITEM_REGEX);
      if (m && currentFile) {
        const [, loc, severity, msg, rule] = m;
        const target = severity === "error" ? errors : warnings;
        if (severity === "error") errorCount++;
        else warningCount++;
        if (!target.has(currentFile)) target.set(currentFile, []);
        target.get(currentFile)!.push({ loc, msg: msg.trim(), rule: rule ?? "" });
        continue;
      }

      // File path header line (no leading whitespace, looks like a path)
      if (!line.startsWith(" ") && /[/.\\]/.test(trimmed) && !trimmed.startsWith("✖")) {
        currentFile = trimmed;
      }
    }

    const allFiles = [...new Set([...errors.keys(), ...warnings.keys()])];
    const prefix = commonDir(allFiles);
    const rel = (f: string) => (prefix && f.startsWith(prefix) ? f.slice(prefix.length) : f);

    const out: string[] = [];
    out.push(
      summaryLine
        ? `${errorCount > 0 ? "FAIL" : "WARN"}: ${summaryLine.replace(/^✖\s*/, "")}`
        : `${input.exitCode === 0 ? "OK" : "FAIL"}: ${errorCount} errors, ${warningCount} warnings`
    );
    if (prefix) out.push(`(paths relative to ${prefix})`);

    // Show errors in full; if there are no errors, show warnings in full instead.
    const primary = errorCount > 0 ? errors : warnings;
    let shown = 0;
    const hidden: string[] = [];
    for (const [file, items] of primary.entries()) {
      if (shown >= MAX_ERRORS) {
        hidden.push(`${rel(file)} (${items.length})`);
        continue;
      }
      out.push(`${rel(file)} (${items.length})`);
      out.push(...renderFile(items));
      shown += items.length;
    }
    if (hidden.length > 0) {
      const rest = hidden.reduce((n, h) => n + Number(h.match(/\((\d+)\)$/)![1]), 0);
      out.push(`… ${rest} more in: ${hidden.join(", ")}. Use inspect_log with query=<file> to read them.`);
    }

    if (errorCount > 0 && warningCount > 0) {
      const byRule = new Map<string, Map<string, number>>();
      for (const [file, items] of warnings.entries()) {
        for (const it of items) {
          const rule = it.rule || "(no rule)";
          if (!byRule.has(rule)) byRule.set(rule, new Map());
          const files = byRule.get(rule)!;
          files.set(rel(file), (files.get(rel(file)) ?? 0) + 1);
        }
      }
      out.push(`Warnings (${warningCount}, not listed; use inspect_log with query=warning):`);
      for (const [rule, files] of byRule.entries()) {
        const total = [...files.values()].reduce((a, b) => a + b, 0);
        const where = [...files.entries()].map(([f, n]) => `${f} (${n})`).join(", ");
        out.push(`  ${total} × ${rule}: ${where}`);
      }
    }

    if (fixableLine) out.push(fixableLine);

    return out.join("\n");
  },
};
