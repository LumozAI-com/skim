#!/usr/bin/env node
import { formatSkimOutput, runCompressed } from "./core/runner.js";
import { inspectRun, loadStats } from "./core/store.js";
import { startMcpServer } from "./mcp.js";

function printHelp(): void {
  console.log(`skim - Token-efficient CLI & MCP output compressor for AI coding agents

Usage:
  skim run <command...>              Run a command and print compressed output
  skim inspect <run_id> [options]    Inspect saved raw output from a run
    --query <text>                   Search matching lines (case-insensitive)
    --start <line>                   1-based start line
    --end <line>                     1-based end line
    --context <n>                    Context lines around query matches (default: 2)
  skim mcp                           Start the MCP stdio server
  skim stats                         Show cumulative local token savings
  skim --help                        Show this help message`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sub = args[0];

  if (!sub || sub === "-h" || sub === "--help") {
    printHelp();
    process.exit(0);
  }

  if (sub === "mcp") {
    await startMcpServer();
    return;
  }

  if (sub === "run") {
    const cmd = args.slice(1).join(" ").trim();
    if (!cmd) {
      console.error("Error: missing command. Example: skim run npm test");
      process.exit(1);
    }
    const result = await runCompressed(cmd);
    console.log(formatSkimOutput(result));
    process.exit(result.exitCode);
  }

  if (sub === "inspect") {
    const runId = args[1];
    if (!runId) {
      console.error("Error: missing run_id. Example: skim inspect run_a1b2c3 --query Error");
      process.exit(1);
    }

    let query: string | undefined;
    let startLine: number | undefined;
    let endLine: number | undefined;
    let contextLines: number | undefined;

    for (let i = 2; i < args.length; i++) {
      if (args[i] === "--query" && args[i + 1]) {
        query = args[++i];
      } else if (args[i] === "--start" && args[i + 1]) {
        startLine = Number(args[++i]);
      } else if (args[i] === "--end" && args[i + 1]) {
        endLine = Number(args[++i]);
      } else if (args[i] === "--context" && args[i + 1]) {
        contextLines = Number(args[++i]);
      }
    }

    const res = inspectRun(runId, { query, startLine, endLine, contextLines });
    if (!res) {
      console.error(`Run "${runId}" not found.`);
      process.exit(1);
    }
    console.log(`[${res.runId} | ${res.command} | ${res.returnedLines}/${res.totalLines} lines]`);
    console.log(res.content);
    return;
  }

  if (sub === "stats") {
    const stats = loadStats();
    const pct =
      stats.totalRawTokens > 0
        ? ((stats.totalSavedTokens / stats.totalRawTokens) * 100).toFixed(1)
        : "0.0";
    console.log(`skim local stats:`);
    console.log(`  Runs:        ${stats.totalRuns}`);
    console.log(`  Raw tokens:  ${stats.totalRawTokens.toLocaleString()}`);
    console.log(`  Compressed:  ${stats.totalCompressedTokens.toLocaleString()}`);
    console.log(`  Saved:       ${stats.totalSavedTokens.toLocaleString()} (${pct}%)`);
    const entries = Object.entries(stats.byParser);
    if (entries.length > 0) {
      console.log(`\nBy parser:`);
      for (const [name, p] of entries) {
        const saved = Math.max(0, p.rawTokens - p.compressedTokens);
        const pPct = p.rawTokens > 0 ? ((saved / p.rawTokens) * 100).toFixed(1) : "0.0";
        console.log(`  ${name.padEnd(14)} ${p.runs} runs | -${saved.toLocaleString()} tok (-${pPct}%)`);
      }
    }
    return;
  }

  console.error(`Unknown subcommand "${sub}". Run "skim --help" for usage.`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
