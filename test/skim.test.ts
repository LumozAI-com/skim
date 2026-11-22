import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import {
  builtinParsers,
  compressOutput,
  countTokens,
  formatSkimOutput,
  inspectRun,
  parseTimeout,
  runCompressed,
  stripAnsi,
} from "../src/index.js";

describe("skim core", () => {
  let tmpDir: string;
  const origSkimDir = process.env.SKIM_DIR;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skim-test-"));
    process.env.SKIM_DIR = tmpDir;
  });

  after(() => {
    if (origSkimDir === undefined) {
      delete process.env.SKIM_DIR;
    } else {
      process.env.SKIM_DIR = origSkimDir;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("strips ANSI codes and collapses carriage-return progress lines", () => {
    const raw = "\x1b[32mDownloading 10%\rDownloading 50%\rDownloading 100%\x1b[0m\n\x1b[31mDone\x1b[0m";
    assert.equal(stripAnsi(raw), "Downloading 100%\nDone");
  });

  it("compresses Vitest failures while stripping passing tests and node_modules frames", () => {
    const raw = [
      " ✓ src/utils/math.test.ts (12 tests) 14ms",
      " ✓ src/utils/date.test.ts (8 tests) 9ms",
      " × src/auth/login.test.ts > login > rejects expired token",
      "   AssertionError: expected 200 to be 401",
      "   Expected: 401",
      "   Received: 200",
      "   ❯ src/auth/login.test.ts:42:18",
      "   ❯ node_modules/vitest/dist/chunk-runtime.js:112:9",
      "   ❯ node:internal/process/task_queues:95:5",
      "",
      " Test Files  1 failed | 2 passed (3)",
      "      Tests  1 failed | 20 passed (21)",
      "   Duration  1.42s",
    ].join("\n");

    const res = compressOutput({
      command: "npx vitest run",
      stdout: raw,
      stderr: "",
      exitCode: 1,
    });

    assert.equal(res.parser, "vitest-jest");
    assert.match(res.summary, /FAIL \(exit 1\)/);
    assert.match(res.summary, /rejects expired token/);
    assert.match(res.summary, /src\/auth\/login\.test\.ts:42:18/);
    assert.doesNotMatch(res.summary, /node_modules/);
    assert.doesNotMatch(res.summary, /math\.test\.ts/);
  });

  it("compresses pytest failures cleanly", () => {
    const raw = [
      "============================= test session starts ==============================",
      "platform darwin -- Python 3.12.2, pytest-8.1.1",
      "collected 24 items",
      "tests/test_api.py ....................F...",
      "=================================== FAILURES ===================================",
      "___________________________ test_create_order_total ____________________________",
      "    def test_create_order_total():",
      "        res = calc_total([10, 20], discount=5)",
      ">       assert res == 25",
      "E       assert 30 == 25",
      "tests/test_api.py:88: AssertionError",
      "=========================== short test summary info ============================",
      "FAILED tests/test_api.py::test_create_order_total - assert 30 == 25",
      "========================= 1 failed, 23 passed in 1.12s =========================",
    ].join("\n");

    const res = compressOutput({
      command: "pytest",
      stdout: raw,
      stderr: "",
      exitCode: 1,
    });

    assert.equal(res.parser, "pytest");
    assert.match(res.summary, /1 failed, 23 passed/);
    assert.match(res.summary, /test_create_order_total/);
    assert.match(res.summary, /tests\/test_api\.py:88/);
    assert.match(res.summary, /E\s+assert 30 == 25/);
  });

  it("groups TypeScript compiler errors by file", () => {
    // tsc --pretty output: code frames + squiggles make it worth compressing
    const block = (file: string, line: number, col: number, code: string, msg: string) => [
      `\x1b[96m${file}\x1b[0m:\x1b[93m${line}\x1b[0m:\x1b[93m${col}\x1b[0m - \x1b[91merror\x1b[0m\x1b[90m ${code}: \x1b[0m${msg}`,
      "",
      `\x1b[7m${line}\x1b[0m     const value: number = someFunctionCall(argumentOne, argumentTwo);`,
      "\x1b[7m  \x1b[0m \x1b[91m                          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\x1b[0m",
      "",
    ];
    const raw = [
      ...block("src/server.ts", 14, 22, "TS2345", "Argument of type 'string' is not assignable to parameter of type 'number'."),
      ...block("src/server.ts", 29, 5, "TS2322", "Type 'null' is not assignable to type 'User'."),
      ...block("src/auth.ts", 8, 10, "TS7006", "Parameter 'req' implicitly has an 'any' type."),
      "",
      "Found 3 errors in 2 files.",
      "",
      "Errors  Files",
      "     2  src/server.ts:14",
      "     1  src/auth.ts:8",
    ].join("\n");

    const res = compressOutput({
      command: "npx tsc --noEmit --pretty",
      stdout: raw,
      stderr: "",
      exitCode: 2,
    });

    assert.equal(res.parser, "tsc");
    assert.equal(res.passthrough, false);
    assert.match(res.summary, /3 TS errors in 2 files/);
    assert.match(res.summary, /L14:22 \[TS2345\]/);
    assert.match(res.summary, /src\/auth\.ts/);
  });

  it("tsc: keeps nested cause lines and related locations", () => {
    const raw = [
      "src/a.ts(2,14): error TS2420: Class 'MemoryRepo' incorrectly implements interface 'Repo'.",
      "  Property 'remove' is missing in type 'MemoryRepo' but required in type 'Repo'.",
      "src/a.ts(5,49): error TS2339: Property 'value' does not exist on type 'Result<T>'.",
      "  Property 'value' does not exist on type '{ ok: false; error: string; }'.",
      ...Array.from({ length: 20 }, (_, i) => `src/b.ts(${i + 1},14): error TS2322: Type 'string' is not assignable to type 'number'.`),
    ].join("\n");
    const res = compressOutput({ command: "npx tsc --noEmit", stdout: raw, stderr: "", exitCode: 2 });
    assert.match(res.summary, /Property 'remove' is missing in type 'MemoryRepo'/);
    assert.match(res.summary, /does not exist on type '\{ ok: false; error: string; \}'/);
  });

  it("tsc: shows every error and every file (no silent cap at 25)", () => {
    const files = ["src/repo.ts", "src/search.ts", "src/ui/card.ts", "src/board.ts"];
    const raw = files
      .flatMap((f, fi) =>
        Array.from({ length: 11 }, (_, i) => `${f}(${i + 1},${fi + 3}): error TS2322: Type 'x${i}' is not assignable to type 'y${i}'.`)
      )
      .join("\n");
    // Unique plain errors barely compress, so skim passes the raw output through (nothing lost)...
    const res = compressOutput({ command: "npx tsc --noEmit", stdout: raw, stderr: "", exitCode: 2 });
    assert.equal(res.passthrough, true);
    assert.equal(res.summary, raw);
    // ...and the parser itself must still show all 44 errors and all 4 files.
    const tsc = builtinParsers.find((p) => p.name === "tsc")!;
    const summary = tsc.parse({ command: "npx tsc", stdout: raw, stderr: "", exitCode: 2 }, raw);
    assert.match(summary, /44 TS errors in 4 files/);
    for (const f of files) assert.match(summary, new RegExp(`${f.replace(/[/.]/g, "\\$&")} \\(11\\)`));
    assert.doesNotMatch(summary, /more error/);
    assert.equal((summary.match(/\[TS2322\]/g) || []).length, 44);
  });

  it("tsc: merges identical errors in a file into one line with all locations", () => {
    const raw = Array.from({ length: 10 }, (_, i) => `src/c.ts(${i + 1},20): error TS7006: Parameter 'x' implicitly has an 'any' type.`).join("\n");
    const res = compressOutput({ command: "npx tsc", stdout: raw, stderr: "", exitCode: 2 });
    assert.match(res.summary, /L1:20, L2:20, L3:20, L4:20, L5:20, L6:20, L7:20, L8:20, L9:20, L10:20 \[TS7006\]/);
  });

  it("tsc: past the error limit, still names every file that has hidden errors", () => {
    const raw = [
      ...Array.from({ length: 200 }, (_, i) => `src/a.ts(${i + 1},1): error TS2322: Msg ${i}.`),
      ...Array.from({ length: 5 }, (_, i) => `src/ui/card.ts(${i + 1},1): error TS2554: Other ${i}.`),
    ].join("\n");
    const res = compressOutput({ command: "npx tsc", stdout: raw, stderr: "", exitCode: 2 });
    assert.match(res.summary, /205 TS errors in 2 files/);
    assert.match(res.summary, /Not shown: src\/ui\/card\.ts \(5\)/);
    assert.match(res.summary, /55 more errors/);
  });

  it("passes short output through unchanged instead of making it bigger", () => {
    const raw = [
      "src/server.ts(14,22): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.",
      "src/server.ts(29,5): error TS2322: Type 'null' is not assignable to type 'User'.",
      "src/auth.ts(8,10): error TS7006: Parameter 'req' implicitly has an 'any' type.",
    ].join("\n");

    const res = compressOutput({ command: "npx tsc --noEmit", stdout: raw, stderr: "", exitCode: 2 });

    assert.equal(res.passthrough, true);
    assert.equal(res.summary, raw);
    const formatted = formatSkimOutput({ ...res, runId: "run_abc123" });
    assert.equal(formatted, `${raw}\n[exit 2]`);
    assert.ok(countTokens(formatted) <= countTokens(raw) + 6);
  });

  it("never returns more tokens than the raw output (plus the 6-token exit marker)", () => {
    const samples = ["ok", "Build succeeded.", "error: x", "a.ts(1,1): error TS1: y"];
    for (const s of samples) {
      const res = compressOutput({ command: "npx tsc", stdout: s, stderr: "", exitCode: 1 });
      assert.ok(countTokens(formatSkimOutput(res)) <= countTokens(s) + 6, s);
    }
  });

  it("counts tokens with the real o200k tokenizer", () => {
    assert.equal(countTokens(""), 0);
    assert.equal(countTokens("return"), 1);
    assert.equal(countTokens("hello world"), 2);
  });

  it("uses a short footer with run id, raw line count, and exit code", () => {
    const res = compressOutput({
      command: "pytest",
      stdout: Array.from({ length: 80 }, (_, i) => `tests/test_x.py::test_${i} PASSED`).join("\n") + "\n===== 80 passed in 0.1s =====",
      stderr: "",
      exitCode: 0,
    });
    const out = formatSkimOutput({ ...res, runId: "run_abc123" });
    assert.match(out, /\n\[skim run_abc123 · 81 lines\]$/);
  });

  it("strips npm install noise on success", () => {
    const raw = [
      "npm warn deprecated inflight@1.0.6: This module is not supported",
      "npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported",
      "added 142 packages, and audited 143 packages in 9s",
      "45 packages are looking for funding",
      "  run `npm fund` for details",
      "found 0 vulnerabilities",
    ].join("\n");

    const res = compressOutput({
      command: "npm install",
      stdout: raw,
      stderr: "",
      exitCode: 0,
    });

    assert.equal(res.parser, "pkg-install");
    assert.match(res.summary, /added 142 packages/);
    assert.doesNotMatch(res.summary, /deprecated/);
    assert.doesNotMatch(res.summary, /funding/);
  });

  it("omits lockfile diffs in git diff", () => {
    const raw = [
      "diff --git a/package-lock.json b/package-lock.json",
      "index 1111111..2222222 100644",
      "--- a/package-lock.json",
      "+++ b/package-lock.json",
      "@@ -1,500 +1,500 @@",
      ...Array.from({ length: 120 }, (_, i) => `+  "pkg-${i}": "1.0.0",`),
      "diff --git a/src/index.ts b/src/index.ts",
      "index 3333333..4444444 100644",
      "--- a/src/index.ts",
      "+++ b/src/index.ts",
      "@@ -1,3 +1,4 @@",
      " const a = 1;",
      "+const b = 2;",
    ].join("\n");

    const res = compressOutput({
      command: "git diff",
      stdout: raw,
      stderr: "",
      exitCode: 0,
    });

    assert.equal(res.parser, "git");
    assert.match(res.summary, /package-lock\.json \[lockfile diff omitted\]/);
    assert.match(res.summary, /\+const b = 2;/);
    assert.ok(res.savedPercent > 75);
  });

  it("executes a real command, stores raw log, and supports inspect_log drill-down", async () => {
    const res = await runCompressed(
      `node -e "for (let i = 1; i <= 60; i++) console.log('line ' + i + (i === 42 ? ' SPECIAL_NEEDLE' : ''))"`
    );

    assert.equal(res.exitCode, 0);
    assert.ok(res.runId);
    assert.ok(res.savedPercent > 40);

    const inspected = inspectRun(res.runId!, { query: "SPECIAL_NEEDLE", contextLines: 1 });
    assert.ok(inspected);
    assert.match(inspected.content, /42: line 42 SPECIAL_NEEDLE/);
    assert.match(inspected.content, /41: line 41/);
    assert.match(inspected.content, /43: line 43/);
  });

  it("parses timeout durations and supports timeoutMs: 0 (no timeout)", async () => {
    assert.equal(parseTimeout("0"), 0);
    assert.equal(parseTimeout("off"), 0);
    assert.equal(parseTimeout("30s"), 30_000);
    assert.equal(parseTimeout("10m"), 600_000);
    assert.equal(parseTimeout("1500"), 1500);
    assert.equal(parseTimeout("bogus"), undefined);

    const noTimeout = await runCompressed(`node -e "console.log('ok')"`, { timeoutMs: 0 });
    assert.equal(noTimeout.exitCode, 0);
    assert.match(noTimeout.summary, /ok/);

    const timedOut = await runCompressed(`node -e "setTimeout(() => {}, 2000)"`, { timeoutMs: 80 });
    assert.equal(timedOut.exitCode, 124);
    assert.match(timedOut.summary, /timed out/i);
  });
});
