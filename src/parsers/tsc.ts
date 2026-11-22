import type { CompressInput, OutputParser } from "../core/types.js";

/**
 * tsc parser. Rule: never drop an error or its cause.
 *
 * What it removes (safe to remove):
 *   - code frames and ~~~ squiggles from `--pretty` output
 *   - the "Found N errors" line and the "Errors  Files" table (replaced by a header)
 *   - repeated file paths (errors are grouped by file)
 *   - repeated messages: identical errors with no detail lines in the same file are
 *     merged into one line with all their locations
 *
 * What it always keeps:
 *   - every error's location, code and message
 *   - every detail line under an error (the nested "actual cause" lines and
 *     "'x' is declared here" related locations), up to MAX_DETAIL_LINES per error
 *   - every file that has errors, with its error count, even past MAX_ERRORS
 */

const TSC_ERR_REGEX =
  /^([^\s(:]+)(?:\((\d+),(\d+)\):|:(\d+):(\d+)\s*-?)\s*error\s+(TS\d+):\s*(.+)$/;
/** Related-information line in --pretty output: `src/a.ts:1:40 - 'remove' is declared here.` */
const RELATED_REGEX = /^([^\s(:]+):(\d+):(\d+)\s+-\s+(.+)$/;
const FOUND_REGEX = /^Found \d+ errors?\b/; // "Found 37 errors in 4 files." / "Found 4 errors in the same file, starting at: a.ts:4" / "Found 1 error in a.ts:4"
const TABLE_HEADER_REGEX = /^Errors\s+Files$/;
const TABLE_ROW_REGEX = /^\d+\s+\S+(:\d+)?$/;
const CODE_FRAME_REGEX = /^\d+\s/; // "14     const x = ..." (gutter line number + code)
const SQUIGGLE_REGEX = /^~+$/;

/** Past this many errors, the rest are summarized per file (all files are still listed). */
export const MAX_ERRORS = 150;
/** Long nested chains keep their first and last lines; the last line is usually the real cause. */
export const MAX_DETAIL_LINES = 6;

interface TscError {
  line: string;
  col: string;
  code: string;
  msg: string;
  details: string[];
}

function trimDetails(details: string[]): string[] {
  if (details.length <= MAX_DETAIL_LINES) return details;
  const head = details.slice(0, 3);
  const tail = details.slice(-2);
  return [...head, `… ${details.length - 5} more detail lines …`, ...tail];
}

export const tscParser: OutputParser = {
  name: "tsc",

  match(command: string, rawOutput: string): boolean {
    const cmd = command.toLowerCase();
    if (/\btsc\b/.test(cmd) || /\btypecheck\b/.test(cmd)) return true;
    return /error\s+TS\d{4}:/.test(rawOutput);
  },

  parse(input: CompressInput, cleanOutput: string): string {
    if (input.exitCode === 0 && !/error\s+TS\d{4}:/.test(cleanOutput)) {
      return "OK: 0 TypeScript errors";
    }

    const byFile = new Map<string, TscError[]>();
    let current: TscError | null = null;
    let totalErrors = 0;

    for (const rawLine of cleanOutput.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;

      const m = line.match(TSC_ERR_REGEX);
      if (m) {
        const file = m[1];
        current = {
          line: m[2] || m[4],
          col: m[3] || m[5],
          code: m[6],
          msg: m[7].trim(),
          details: [],
        };
        if (!byFile.has(file)) byFile.set(file, []);
        byFile.get(file)!.push(current);
        totalErrors++;
        continue;
      }

      if (FOUND_REGEX.test(line) || TABLE_HEADER_REGEX.test(line)) {
        current = null;
        continue;
      }
      if (!current) continue;
      if (CODE_FRAME_REGEX.test(line) || SQUIGGLE_REGEX.test(line) || TABLE_ROW_REGEX.test(line)) {
        continue;
      }

      const rel = line.match(RELATED_REGEX);
      current.details.push(rel ? `→ ${rel[1]}:${rel[2]}:${rel[3]} ${rel[4]}` : line);
    }

    if (totalErrors === 0) {
      const nonEmpty = cleanOutput.split("\n").map((l) => l.trim()).filter(Boolean);
      return `FAIL (exit ${input.exitCode})\n${nonEmpty.slice(0, 15).join("\n")}`;
    }

    const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
    const out: string[] = [
      `FAIL: ${plural(totalErrors, "TS error")} in ${plural(byFile.size, "file")}`,
    ];

    let shown = 0;
    const hidden: string[] = [];

    for (const [file, errs] of byFile.entries()) {
      if (shown >= MAX_ERRORS) {
        hidden.push(`${file} (${errs.length})`);
        continue;
      }
      out.push(`${file} (${errs.length})`);

      // Merge identical detail-less errors into one line listing all locations.
      const merged = new Map<string, { locs: string[]; err: TscError }>();
      const order: Array<{ key: string } | { err: TscError }> = [];
      for (const err of errs) {
        if (err.details.length === 0) {
          const key = `${err.code}\u0000${err.msg}`;
          const loc = `L${err.line}:${err.col}`;
          if (merged.has(key)) {
            merged.get(key)!.locs.push(loc);
          } else {
            merged.set(key, { locs: [loc], err });
            order.push({ key });
          }
        } else {
          order.push({ err });
        }
      }

      let fileShown = 0;
      for (const item of order) {
        if (shown >= MAX_ERRORS) break;
        if ("key" in item) {
          const { locs, err } = merged.get(item.key)!;
          out.push(`  ${locs.join(", ")} [${err.code}] ${err.msg}`);
          shown += locs.length;
          fileShown += locs.length;
        } else {
          const err = item.err;
          out.push(`  L${err.line}:${err.col} [${err.code}] ${err.msg}`);
          for (const d of trimDetails(err.details)) out.push(`    ${d}`);
          shown++;
          fileShown++;
        }
      }
      if (fileShown < errs.length) {
        out.push(`  … ${errs.length - fileShown} more in this file`);
      }
    }

    if (hidden.length > 0 || shown < totalErrors) {
      const rest = totalErrors - shown;
      const where = hidden.length > 0 ? ` Not shown: ${hidden.join(", ")}.` : "";
      out.push(`… ${plural(rest, "more error")}.${where} Use inspect_log with query=<file> to read them.`);
    }

    return out.join("\n");
  },
};
