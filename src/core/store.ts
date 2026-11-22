import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { InspectOptions, InspectResult, RunRecord, SkimStats } from "./types.js";

const MAX_STORED_RUNS = 100;

export function getSkimDir(): string {
  return process.env.SKIM_DIR || path.join(os.homedir(), ".skim");
}

function getRunsDir(): string {
  const dir = path.join(getSkimDir(), "runs");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getStatsPath(): string {
  const dir = getSkimDir();
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "stats.json");
}

export function generateRunId(): string {
  return `run_${crypto.randomBytes(3).toString("hex")}`;
}

export function saveRun(record: RunRecord): void {
  const runsDir = getRunsDir();
  const filePath = path.join(runsDir, `${record.runId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(record), "utf8");
  pruneOldRuns(runsDir);
  recordStats(record);
}

export function loadRun(runId: string): RunRecord | null {
  const safeId = path.basename(runId);
  const filePath = path.join(getRunsDir(), `${safeId}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as RunRecord;
  } catch {
    return null;
  }
}

export function inspectRun(runId: string, options: InspectOptions = {}): InspectResult | null {
  const record = loadRun(runId);
  if (!record) return null;

  const lines = record.rawOutput.split("\n");
  const totalLines = lines.length;
  const maxLines = Math.max(1, Math.min(options.maxLines ?? 80, 300));

  if (options.query) {
    const context = Math.max(0, Math.min(options.contextLines ?? 2, 10));
    const q = options.query.toLowerCase();
    const matchedIndices = new Set<number>();

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(q)) {
        const start = Math.max(0, i - context);
        const end = Math.min(lines.length - 1, i + context);
        for (let j = start; j <= end; j++) {
          matchedIndices.add(j);
        }
      }
    }

    const sorted = Array.from(matchedIndices).sort((a, b) => a - b);
    const sliced = sorted.slice(0, maxLines);
    const out: string[] = [];
    let prev = -2;
    for (const idx of sliced) {
      if (prev >= 0 && idx > prev + 1) {
        out.push("...");
      }
      out.push(`${idx + 1}: ${lines[idx]}`);
      prev = idx;
    }

    if (sorted.length > maxLines) {
      out.push(`... (${sorted.length - maxLines} more matching lines omitted)`);
    }

    return {
      runId: record.runId,
      command: record.command,
      totalLines,
      returnedLines: sliced.length,
      content: out.length > 0 ? out.join("\n") : `No lines matching "${options.query}" in ${runId}.`,
    };
  }

  const startLine = Math.max(1, options.startLine ?? 1);
  const endLine = Math.min(totalLines, options.endLine ?? startLine + maxLines - 1);
  const clampedEnd = Math.min(endLine, startLine + maxLines - 1);

  const out: string[] = [];
  for (let i = startLine - 1; i < clampedEnd; i++) {
    out.push(`${i + 1}: ${lines[i]}`);
  }
  if (clampedEnd < totalLines) {
    out.push(`... (${totalLines - clampedEnd} more lines; use startLine=${clampedEnd + 1} to continue)`);
  }

  return {
    runId: record.runId,
    command: record.command,
    totalLines,
    returnedLines: clampedEnd - startLine + 1,
    content: out.join("\n"),
  };
}

export function loadStats(): SkimStats {
  const statsPath = getStatsPath();
  if (!fs.existsSync(statsPath)) {
    return {
      totalRuns: 0,
      totalRawTokens: 0,
      totalCompressedTokens: 0,
      totalSavedTokens: 0,
      byParser: {},
    };
  }
  try {
    return JSON.parse(fs.readFileSync(statsPath, "utf8")) as SkimStats;
  } catch {
    return {
      totalRuns: 0,
      totalRawTokens: 0,
      totalCompressedTokens: 0,
      totalSavedTokens: 0,
      byParser: {},
    };
  }
}

function recordStats(record: RunRecord): void {
  const stats = loadStats();
  const saved = Math.max(0, record.rawTokens - record.compressedTokens);
  stats.totalRuns += 1;
  stats.totalRawTokens += record.rawTokens;
  stats.totalCompressedTokens += record.compressedTokens;
  stats.totalSavedTokens += saved;

  if (!stats.byParser[record.parser]) {
    stats.byParser[record.parser] = { runs: 0, rawTokens: 0, compressedTokens: 0 };
  }
  stats.byParser[record.parser].runs += 1;
  stats.byParser[record.parser].rawTokens += record.rawTokens;
  stats.byParser[record.parser].compressedTokens += record.compressedTokens;

  fs.writeFileSync(getStatsPath(), JSON.stringify(stats, null, 2), "utf8");
}

function pruneOldRuns(runsDir: string): void {
  const files = fs
    .readdirSync(runsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const full = path.join(runsDir, f);
      return { full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  for (let i = MAX_STORED_RUNS; i < files.length; i++) {
    try {
      fs.unlinkSync(files[i].full);
    } catch {
      // ignore race conditions
    }
  }
}
