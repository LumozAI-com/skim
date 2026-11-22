# Skim — Simple User Manual

Welcome to **skim**! This guide explains what `skim` does and how to use it in plain, simple steps.

---

## 1. What is `skim`?

When an AI coding assistant (like Claude Code, Cursor, or Codex) runs commands like `npm test`, `pytest`, or `npm install`, your terminal prints hundreds or thousands of lines of text. Most of that text is noise (passing tests, download bars, warnings).

**`skim` sits in the middle and cleans that output up:**
- It keeps only the **important lines** (which test failed, the error message, and the file + line number).
- It **saves the full original output** on your computer under a short ID (like `run_a1b2c3`), just in case the AI ever needs to look closer.
- If the output is already short, `skim` leaves it alone so it never wastes tokens.

**Result:** Your AI agent uses **60%–95% fewer tokens**, hits rate limits much less often, and stays focused on fixing your code.

---

## 2. Requirements

- **Node.js 20 or newer** installed on your computer.
- Everything runs **100% locally** on your machine. No account, no API key, and your code is never sent anywhere.

---

## 3. How to Connect `skim` to Your AI Agent (Recommended)

`skim` works with any AI coding tool that supports **MCP** (Claude Code, Cursor, Codex, Windsurf, Antigravity, etc.).

Add this small block to your MCP settings file:

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

Restart your AI tool. That's it!

Your AI agent will now automatically have two tools:
1. **`run_compressed`** — Runs terminal commands and gets back short, clean output + a `run_id`.
2. **`inspect_log`** — Looks inside the saved full log using that `run_id` if it ever needs extra details.

---

## 4. How to Use `skim` in Your Terminal (CLI)

You can also run `skim` yourself in any terminal:

### Run a command with clean output
Put `skim run` in front of any command:

```bash
# Run a command with clean output (default timeout: 5 minutes)
skim run npm test
skim run pytest -v
skim run npm install
skim run git diff

# For slow builds or long test suites, raise or disable the timeout:
skim run --timeout 15m npx playwright test
skim run --timeout 0 npm run build
# Or set SKIM_TIMEOUT_MS=0 in your environment to disable timeouts globally
```

At the bottom of a compressed result, you'll see a short footer like:
```text
[skim run_a1b2c3 · 249 lines · exit 1]
```

### Look inside the full saved log (only when needed)
If you or your agent want to see more lines from that run, use `skim inspect` with the ID from the footer:

```bash
# Search for a specific word in the full log
skim inspect run_a1b2c3 --query "TypeError"

# Read specific line numbers (for example, lines 1 to 50)
skim inspect run_a1b2c3 --start 1 --end 50
```

### See how many tokens you've saved
```bash
skim stats
```
This prints your total runs and total tokens saved on your machine.

---

## 5. What Commands Does `skim` Understand?

`skim` automatically detects what you ran:
- **Tests:** `vitest`, `jest`, `pytest` (hides passing tests & `node_modules` noise, keeps failures)
- **TypeScript & Linting:** `tsc`, `eslint` (groups errors cleanly by file)
- **Package Installs:** `npm`, `pnpm`, `yarn`, `pip`, `uv` (removes progress bars, deprecation warnings, and funding notices)
- **Git:** `git status`, `git diff`, `git log` (skips giant lockfile diffs like `package-lock.json`)
- **Everything else:** Smart generic cleaner that removes duplicate lines and progress noise while keeping errors.

---

## 6. Quick FAQ

**Does `skim` send my code or logs to any server?**  
No. `skim` runs completely offline on your own computer. Saved logs stay in `~/.skim/runs` and automatically clean up after 100 runs.

**What if `skim` hides a line I actually needed?**  
Nothing is lost. Just run `skim inspect <run_id> --query "..."` (or let your AI call `inspect_log`) to read the exact lines from the saved raw log — no need to re-run the command.

**Will `skim` ever make short outputs longer?**  
No. If compressing doesn't save at least 10% of tokens, `skim` simply passes the original output straight through.
