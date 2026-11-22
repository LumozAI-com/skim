import type { CompressInput, OutputParser } from "../core/types.js";

export const pkgInstallParser: OutputParser = {
  name: "pkg-install",

  match(command: string, rawOutput: string): boolean {
    const cmd = command.toLowerCase();
    if (/^\s*(npm|pnpm|yarn|bun|pip|pip3|uv)\s+(i|install|add|ci|update|remove|uninstall)\b/.test(cmd)) {
      return true;
    }
    if (/added \d+ packages, and audited \d+ packages/.test(rawOutput)) return true;
    if (/Successfully installed\s+\S+/.test(rawOutput)) return true;
    return false;
  },

  parse(input: CompressInput, cleanOutput: string): string {
    const lines = cleanOutput.split("\n").map((l) => l.trim()).filter(Boolean);

    if (input.exitCode !== 0) {
      const errLines = lines.filter((l) =>
        /(ERR!|ERROR|ERESOLVE|EACCES|ENOENT|ETIMEDOUT|Could not resolve|Failed to|Conflict|Traceback)/i.test(l)
      );
      const picked = errLines.length > 0 ? errLines.slice(0, 20) : lines.slice(-15);
      return `FAIL (exit ${input.exitCode})\n${picked.join("\n")}`;
    }

    const highlights: string[] = [];

    // npm / pnpm / yarn summary lines
    for (const line of lines) {
      if (
        /^(added|removed|changed|up to date|Done in|Progress:|Packages:|Successfully installed|Installed \d+ packages)/i.test(
          line
        ) ||
        /\bvulnerabilit(y|ies)\b/i.test(line)
      ) {
        if (!/npm audit fix|run `npm audit`/i.test(line)) {
          highlights.push(line);
        }
      }
    }

    if (highlights.length > 0) {
      return `OK\n${Array.from(new Set(highlights)).slice(0, 6).join("\n")}`;
    }

    return `OK (${lines.length} lines suppressed)`;
  },
};
