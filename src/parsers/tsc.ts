import type { CompressInput, OutputParser } from "../core/types.js";

const TSC_ERR_REGEX =
  /^([^\s(:]+)(?:\((\d+),(\d+)\):|:(\d+):(\d+)\s*-?)\s*error\s+(TS\d+):\s*(.+)$/;

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

    const lines = cleanOutput.split("\n");
    const byFile = new Map<string, string[]>();
    let totalErrors = 0;

    for (const line of lines) {
      const m = line.trim().match(TSC_ERR_REGEX);
      if (!m) continue;
      const file = m[1];
      const lineNum = m[2] || m[4];
      const colNum = m[3] || m[5];
      const code = m[6];
      const msg = m[7].trim();

      totalErrors++;
      if (!byFile.has(file)) byFile.set(file, []);
      byFile.get(file)!.push(`  L${lineNum}:${colNum} [${code}] ${msg}`);
    }

    if (totalErrors === 0) {
      const nonEmpty = lines.map((l) => l.trim()).filter(Boolean);
      return `FAIL (exit ${input.exitCode})\n${nonEmpty.slice(0, 15).join("\n")}`;
    }

    const out: string[] = [
      `FAIL: ${totalErrors} TS error${totalErrors === 1 ? "" : "s"} in ${byFile.size} file${byFile.size === 1 ? "" : "s"}`,
    ];

    let shown = 0;
    const maxErrors = 25;

    for (const [file, errs] of byFile.entries()) {
      if (shown >= maxErrors) break;
      out.push(file);
      for (const err of errs) {
        if (shown >= maxErrors) break;
        out.push(err);
        shown++;
      }
    }

    if (totalErrors > maxErrors) {
      out.push(`... (${totalErrors - maxErrors} more TS errors; use inspect_log)`);
    }

    return out.join("\n");
  },
};
