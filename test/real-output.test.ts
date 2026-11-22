/**
 * Tests on REAL captured command output (test/fixtures/, machine paths replaced).
 * Rule under test: a parser may drop noise, but never an error, a failing test,
 * or the reason it failed.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { compressOutput, countTokens, formatSkimOutput, stripAnsi } from "../src/index.js";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const load = (f: string) => fs.readFileSync(path.join(dir, f), "utf8");
const run = (command: string, file: string, exitCode = 1) => {
  const raw = load(file);
  const res = compressOutput({ command, stdout: raw, stderr: "", exitCode });
  return { raw, clean: stripAnsi(raw), res, out: formatSkimOutput({ ...res, runId: "run_test01" }) };
};

describe("real output: nothing important is dropped", () => {
  it("vitest: every failing test and every reason (200 tests, 16 failing)", () => {
    for (const file of ["vitest-default.txt", "vitest-verbose.txt"]) {
      const { clean, out, raw } = run("npx vitest run", file);
      const names = [...new Set(clean.split("\n").map((l) => l.trim()).filter((l) => /^FAIL\s+vt\//.test(l)))];
      assert.equal(names.length, 16);
      for (const n of names) assert.ok(out.includes(n), `missing test: ${n}`);
      for (const reason of [
        "\"archived\": true,",
        "expected [Function] to throw an error",
        'Expected: "Hello Ann, you have 4 new messages',
        "Caused by: HttpError: 503 Service Unavailable from /api/users",
      ]) {
        assert.ok(out.includes(reason), `missing reason: ${reason}`);
      }
      assert.doesNotMatch(out, /^×/m, "run-list × lines must not be treated as failures");
      assert.ok(countTokens(out) < countTokens(raw) * 0.15);
    }
  });

  it("jest: every failing test and every reason (200 tests, 16 failing)", () => {
    const { clean, out } = run("npx jest", "jest.txt");
    const names = [...new Set(clean.split("\n").map((l) => l.trim()).filter((l) => /^●\s/.test(l)))];
    assert.equal(names.length, 16);
    for (const n of names) assert.ok(out.includes(n), `missing test: ${n}`);
    for (const reason of [
      "Received function did not throw",
      "Rejected to value: [HttpError: 503 Service Unavailable from /api/users]",
      'Expected: "Hello Ann, you have 4 new messages',
      '-   "archived": true,',
    ]) {
      assert.ok(out.includes(reason), `missing reason: ${reason}`);
    }
  });

  it("eslint: all 67 errors in all 5 files, incl. a parse error with no rule name", () => {
    const { out } = run("npx eslint lint", "eslint.txt");
    for (const f of ["a.js (20)", "b.js (20)", "c.js (20)", "ui/broken.js (1)", "ui/card.js (6)"]) {
      assert.ok(out.includes(f), `missing file: ${f}`);
    }
    assert.match(out, /2:1 Parsing error: Unexpected token/);
    assert.match(out, /10:42 \[no-undef\] 'undefinedThing10' is not defined/);
    assert.match(out, /30 × prefer-const: a\.js \(10\), b\.js \(10\), c\.js \(10\)/);
    assert.doesNotMatch(out, /more errors/);
  });

  it("tsc: all 37 errors and their cause lines (plain and --pretty)", () => {
    for (const file of ["tsc-plain.txt", "tsc-pretty.txt"]) {
      const { out } = run("npx tsc -p .", file, 2);
      assert.match(out, /37 TS errors in 4 files/);
      assert.match(out, /Property 'remove' is missing in type 'MemoryRepo'/);
      assert.match(out, /does not exist on type '\{ ok: false; error: string; \}'/);
      for (const f of ["src/a.ts (6)", "src/b.ts (12)", "src/c.ts (10)", "src/d.ts (9)"]) assert.ok(out.includes(f));
    }
  });

  it("pytest: every failure with its full assertion diff", () => {
    const { out } = run("pytest -v", "pytest-verbose.txt");
    for (const t of ["test_discount_cap", "test_age_bad", "test_slug"]) assert.ok(out.includes(t));
    assert.match(out, /ValueError: invalid literal for int\(\) with base 10: '12a'/);
    assert.match(out, /- hello-world/);
    assert.match(out, /\+ hello_world/);
    assert.doesNotMatch(out, /^\s*E\s+\?\s/m, "diff-marker lines should be dropped");
  });
});

describe("limits: past the cap, everything is still named", () => {
  it("vitest: more than 50 failures lists the rest by name", () => {
    const block = (i: number) => [
      ` FAIL  src/x.test.ts > case ${i}`,
      `AssertionError: expected ${i} to be ${i + 1}`,
      ` ❯ src/x.test.ts:${i + 1}:10`,
      "⎯⎯⎯⎯⎯⎯⎯",
    ];
    const raw = [
      "⎯⎯⎯⎯⎯⎯ Failed Tests 60 ⎯⎯⎯⎯⎯⎯",
      ...Array.from({ length: 60 }, (_, i) => block(i)).flat(),
      " Test Files  1 failed (1)",
      "      Tests  60 failed (60)",
    ].join("\n");
    const res = compressOutput({ command: "npx vitest run", stdout: raw, stderr: "", exitCode: 1 });
    assert.match(res.summary, /… 10 more failing tests/);
    for (let i = 0; i < 60; i++) assert.ok(res.summary.includes(`> case ${i}\n`) || res.summary.endsWith(`> case ${i}`), `case ${i}`);
  });

  it("pytest: long assertion diffs are no longer cut at 4 lines", () => {
    const raw = [
      "=================================== FAILURES ===================================",
      "__________________________________ test_big ___________________________________",
      ...Array.from({ length: 12 }, (_, i) => `E     - line ${i}`),
      "test_x.py:3: AssertionError",
      "=========================== short test summary info ============================",
      "FAILED test_x.py::test_big - AssertionError",
      "============================== 1 failed in 0.01s ===============================",
    ].join("\n");
    const res = compressOutput({ command: "pytest", stdout: raw, stderr: "", exitCode: 1 });
    for (let i = 0; i < 12; i++) assert.match(res.summary, new RegExp(`- line ${i}\\b`));
  });
});
