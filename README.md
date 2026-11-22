# skim

> **Skim first, zoom in only when needed.**  
> Token-efficient CLI & MCP output compressor with lossless-on-demand drill-down for AI coding agents.  
> *An open-source project by LumozAI.*

Coding agents burn thousands of tokens reading passing tests, `node_modules` stack frames, `npm install` warnings, and lockfile diffs. **`skim`** sits between your agent and your shell — compressing noisy tool output down to the few lines that matter, while saving the raw log locally under a `run_id` so the agent can drill in *only* when it actually needs more detail.

- **100% Local & Private:** Zero telemetry, zero accounts, zero cloud calls. Your code never leaves your machine.
- **Lossless-on-Demand:** Never forces an agent to re-run a slow test suite just because a line was trimmed. Every run returns a `run_id` for instant `inspect_log` drill-down.
- **Drop-in MCP + CLI + SDK:** Works with Claude Code, Cursor, Codex, Windsurf, Antigravity, or directly inside your own agent harness.

---

## Benchmark Results

Token counts use the real `o200k_base` tokenizer (GPT-4o family; a close proxy for Claude), and include skim's footer.

**Real command output** (captured from actual runs, not fixtures):

| Command | Raw Tokens | Skim Tokens | Saved |
| :--- | ---: | ---: | ---: |
| `npm install --loglevel verbose` (4 deps) | 9,339 | 36 | **-99.6%** |
| `pytest -v` (203 tests, 3 failing) | 3,889 | 168 | **-95.7%** |
| `pytest` default (203 tests, 3 failing) | 441 | 168 | **-61.9%** |
| `tsc --pretty` (4 errors) | 510 | 132 | **-74.1%** |
| `tsc` plain (4 errors) | 130 | 135 | passthrough (+6-token exit marker) |

Savings depend on how noisy the command is: verbose logs and big test suites compress the most, while output that is already short is passed through unchanged rather than rewritten.

**Synthetic fixtures** (`npm run bench`):

| Scenario | Parser | Raw Tokens | Skim Tokens | Saved |
| :--- | :--- | ---: | ---: | ---: |
| Vitest (2 fails / 48 pass) | `vitest-jest` | 1,569 | 230 | **-85.3%** |
| Pytest (1 fail / 60 pass) | `pytest` | 1,288 | 97 | **-92.5%** |
| TypeScript (`tsc --pretty`) | `tsc` | 314 | 126 | **-59.9%** |
| ESLint (3 errors, 18 warnings) | `eslint` | 502 | 117 | **-76.7%** |
| npm install (noisy) | `pkg-install` | 532 | 37 | **-93%** |
| git diff (code + lockfile) | `git` | 5,915 | 85 | **-98.6%** |

### Passthrough rule

skim only uses its compressed summary when it is at least 10% smaller than the raw output, footer included (`MIN_SAVING_RATIO`). Otherwise the agent gets the raw output (ANSI-stripped) plus `[exit N]` when the command failed. So skim never meaningfully increases token use.

> **New to `skim`?** Read the step-by-step **[Simple User Manual](./USER_MANUAL.md)** for a plain-English setup and usage guide.

---

## Quick Start (MCP Server)

Add `skim` to your MCP client config (Claude Code, Cursor, Codex, etc.):

```json
{
  "mcpServers": {
    "skim": {
      "command": "npx",
      "args": ["-y", "@lumozai/skim", "mcp"]
    }
  }
}
```

### Exposed MCP Tools
1. **`run_compressed`** — Executes a shell command, auto-detects the output format (`vitest`/`jest`, `pytest`, `tsc`, `eslint`, `npm`/`pnpm`/`yarn`/`pip`, `git`, or smart generic fallback), returns a compact summary + `run_id`.
2. **`inspect_log`** — Searches or slices the saved raw output for a `run_id` by `--query` or line range (`startLine`/`endLine`).

---

## CLI Usage

```bash
# Run any command with compressed output (default timeout: 5m)
skim run npx vitest run
skim run pytest -v
skim run npm install

# Custom timeout or disable timeout completely (--timeout 0 / SKIM_TIMEOUT_MS=0)
skim run --timeout 15m npx playwright test
skim run --timeout 0 npm run build

# Drill into a saved raw log only if needed
skim inspect run_a1b2c3 --query "AssertionError" --context 3
skim inspect run_a1b2c3 --start 1 --end 50

# View cumulative local token savings
skim stats
```

---

## Programmatic SDK Usage

Use `skim` directly inside your own coding agent harness:

```ts
import { runCompressed, inspectRun, compressOutput } from "@lumozai/skim";

const result = await runCompressed("npx vitest run", { cwd: "/path/to/repo" });
console.log(result.summary);
console.log(`Saved ${result.savedPercent}% (${result.rawTokens} -> ${result.compressedTokens} tokens)`);

// Drill down if the agent requests more detail
const detail = inspectRun(result.runId!, { query: "TypeError", contextLines: 3 });
```

---

## Roadmap
- [x] **v0.1:** Output compressor (`vitest`/`jest`, `pytest`, `tsc`, `eslint`, `pkg-install`, `git`, `generic`) + lossless-on-demand `inspect_log` + MCP server + CLI + benchmarks
- [ ] **v0.2:** Code zoom layer (`repo_map`, `read_skeleton`, `read_symbol`) via tree-sitter
- [ ] **v0.3:** Session read cache (avoid re-sending unchanged files in long agent sessions)
- [ ] **v0.4:** Additional parsers (`cargo test`, `go test`, `phpunit`, `next build`, `docker build`)

## License
MIT © LumozAI
