import type { CompressInput, OutputParser } from "../core/types.js";

const LOCKFILE_PATTERN = /(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|poetry\.lock|composer\.lock)$/;

export const gitParser: OutputParser = {
  name: "git",

  match(command: string, rawOutput: string): boolean {
    const cmd = command.trim().toLowerCase();
    if (/^git\s+(status|diff|log)\b/.test(cmd)) return true;
    if (/^diff --git a\/.+ b\/.+/m.test(rawOutput)) return true;
    return false;
  },

  parse(input: CompressInput, cleanOutput: string): string {
    const cmd = input.command.trim().toLowerCase();

    if (/^git\s+status\b/.test(cmd)) {
      return parseGitStatus(cleanOutput);
    }

    if (/^git\s+diff\b/.test(cmd) || /^diff --git /m.test(cleanOutput)) {
      return parseGitDiff(cleanOutput);
    }

    if (/^git\s+log\b/.test(cmd)) {
      return parseGitLog(cleanOutput);
    }

    return cleanOutput.trim();
  },
};

function parseGitStatus(clean: string): string {
  const lines = clean.split("\n");
  const out: string[] = [];
  let section = "";

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    // Strip git instructional hint lines
    if (trimmed.startsWith("(use \"git")) continue;

    if (trimmed.startsWith("On branch ") || trimmed.startsWith("HEAD detached")) {
      out.push(trimmed);
      continue;
    }
    if (trimmed.startsWith("Your branch is ")) {
      out.push(trimmed);
      continue;
    }
    if (trimmed.startsWith("Changes to be committed")) {
      section = "staged";
      continue;
    }
    if (trimmed.startsWith("Changes not staged")) {
      section = "unstaged";
      continue;
    }
    if (trimmed.startsWith("Untracked files")) {
      section = "untracked";
      continue;
    }
    if (trimmed.startsWith("nothing to commit")) {
      out.push("clean");
      continue;
    }

    if (section === "staged" || section === "unstaged") {
      const m = trimmed.match(/^(modified|new file|deleted|renamed):\s+(.+)$/);
      if (m) {
        const prefix = section === "staged" ? "S" : "M";
        const kind = m[1] === "deleted" ? "D" : m[1] === "new file" ? "A" : m[1] === "renamed" ? "R" : "M";
        out.push(`${prefix}:${kind} ${m[2]}`);
      }
    } else if (section === "untracked") {
      out.push(`?? ${trimmed}`);
    } else if (/^[MADRCU?!]{1,2}\s+/.test(raw)) {
      // Already porcelain/short format
      out.push(trimmed);
    }
  }

  return out.length > 0 ? out.join("\n") : clean.trim();
}

function parseGitDiff(clean: string): string {
  const lines = clean.split("\n");
  const out: string[] = [];
  let skipLockfile = false;
  let unchangedStreak = 0;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      unchangedStreak = 0;
      const m = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      const file = m ? m[2] : line;
      if (LOCKFILE_PATTERN.test(file)) {
        skipLockfile = true;
        out.push(`--- ${file} [lockfile diff omitted] ---`);
      } else {
        skipLockfile = false;
        out.push(`--- ${file} ---`);
      }
      continue;
    }

    if (skipLockfile) continue;

    // Skip verbose diff metadata lines
    if (
      line.startsWith("index ") ||
      line.startsWith("--- a/") ||
      line.startsWith("+++ b/")
    ) {
      continue;
    }

    if (line.startsWith("@@")) {
      unchangedStreak = 0;
      out.push(line);
      continue;
    }

    if (line.startsWith("+") || line.startsWith("-")) {
      unchangedStreak = 0;
      out.push(line);
      continue;
    }

    // Keep at most 1 unchanged context line around hunks
    unchangedStreak++;
    if (unchangedStreak <= 1) {
      out.push(line);
    }
  }

  const maxLines = 150;
  if (out.length > maxLines) {
    return [
      ...out.slice(0, maxLines),
      `... (${out.length - maxLines} more diff lines omitted; use inspect_log)`,
    ].join("\n");
  }

  return out.join("\n").trim();
}

function parseGitLog(clean: string): string {
  const lines = clean.split("\n");
  const commits: string[] = [];
  let hash = "";

  for (const line of lines) {
    const commitMatch = line.match(/^commit\s+([0-9a-f]{7,40})/);
    if (commitMatch) {
      hash = commitMatch[1].slice(0, 7);
      continue;
    }
    if (hash && line.startsWith("    ") && line.trim()) {
      commits.push(`${hash} ${line.trim()}`);
      hash = "";
    }
  }

  if (commits.length > 0) {
    const max = 25;
    const sliced = commits.slice(0, max);
    if (commits.length > max) {
      sliced.push(`... (${commits.length - max} more commits; use inspect_log)`);
    }
    return sliced.join("\n");
  }

  return clean.split("\n").slice(0, 30).join("\n").trim();
}
