import { compressOutput } from "../src/index.js";

interface BenchmarkCase {
  name: string;
  command: string;
  exitCode: number;
  output: string;
}

const cases: BenchmarkCase[] = [
  {
    name: "Vitest (2 fails / 48 pass)",
    command: "npx vitest run",
    exitCode: 1,
    output: [
      "\x1b[36m RUN \x1b[39m v3.1.1 /workspace/app",
      "",
      ...Array.from(
        { length: 46 },
        (_, i) => ` \x1b[32m✓\x1b[39m src/modules/feature_${i + 1}.test.ts (${(i % 5) + 2} tests) ${10 + i}ms`
      ),
      " \x1b[31m×\x1b[39m src/auth/session.test.ts > SessionManager > refreshes expired token",
      "   \x1b[31mAssertionError: expected { status: 401, error: 'expired' } to deeply equal { status: 200 }\x1b[39m",
      "   Expected: 200",
      "   Received: 401",
      "   > 64 |     expect(res.status).toBe(200);",
      "   ❯ src/auth/session.test.ts:64:24",
      "   ❯ node_modules/@vitest/runner/dist/index.js:146:14",
      "   ❯ node_modules/@vitest/runner/dist/index.js:533:11",
      "   ❯ node_modules/@vitest/runner/dist/index.js:882:26",
      "   ❯ node:internal/process/task_queues:95:5",
      " \x1b[31m×\x1b[39m src/billing/invoice.test.ts > Invoice > applies coupon discount",
      "   \x1b[31mAssertionError: expected 100 to be 80\x1b[39m",
      "   Expected: 80",
      "   Received: 100",
      "   > 29 |     expect(invoice.total).toBe(80);",
      "   ❯ src/billing/invoice.test.ts:29:27",
      "   ❯ node_modules/@vitest/runner/dist/index.js:146:14",
      "   ❯ node_modules/@vitest/runner/dist/index.js:533:11",
      "",
      " Test Files  2 failed | 46 passed (48)",
      "      Tests  2 failed | 184 passed (186)",
      "   Duration  4.82s (transform 1.1s, setup 0ms, collect 3.2s, tests 2.4s)",
    ].join("\n"),
  },
  {
    name: "Pytest (1 fail / 60 pass)",
    command: "pytest -v",
    exitCode: 1,
    output: [
      "============================= test session starts ==============================",
      "platform darwin -- Python 3.12.2, pytest-8.1.1, pluggy-1.4.0 -- /usr/bin/python3",
      "cachedir: .pytest_cache",
      "rootdir: /workspace/api",
      "plugins: asyncio-0.23.6, cov-5.0.0, anyio-4.3.0",
      "collected 61 items",
      "",
      ...Array.from(
        { length: 60 },
        (_, i) => `tests/test_endpoints.py::test_endpoint_case_${i + 1} PASSED [${Math.round(((i + 1) / 61) * 100)}%]`
      ),
      "tests/test_checkout.py::test_apply_promo_code FAILED [100%]",
      "",
      "=================================== FAILURES ===================================",
      "____________________________ test_apply_promo_code _____________________________",
      "",
      "    def test_apply_promo_code():",
      "        cart = Cart(items=[Item(sku='A1', price=5000)])",
      "        cart.apply_promo('SAVE20')",
      ">       assert cart.total == 4000",
      "E       AssertionError: assert 5000 == 4000",
      "E        +  where 5000 = Cart(items=[Item(sku='A1', price=5000)]).total",
      "",
      "tests/test_checkout.py:47: AssertionError",
      "=========================== short test summary info ============================",
      "FAILED tests/test_checkout.py::test_apply_promo_code - AssertionError: assert 5000 == 4000",
      "========================= 1 failed, 60 passed in 2.34s =========================",
    ].join("\n"),
  },
  {
    name: "TypeScript (`tsc --pretty`)",
    command: "npx tsc --noEmit --pretty",
    exitCode: 2,
    output: [
      "\x1b[96msrc/api/users.ts\x1b[0m:\x1b[93m42\x1b[0m:\x1b[93m15\x1b[0m - \x1b[91merror\x1b[0m \x1b[90mTS2345:\x1b[0m Argument of type 'string | undefined' is not assignable to parameter of type 'string'.",
      "  Type 'undefined' is not assignable to type 'string'.",
      "",
      "42   sendEmail(user.email);",
      "                 ~~~~~~~~~~",
      "",
      "\x1b[96msrc/api/users.ts\x1b[0m:\x1b[93m78\x1b[0m:\x1b[93m7\x1b[0m - \x1b[91merror\x1b[0m \x1b[90mTS2322:\x1b[0m Type 'number' is not assignable to type 'string'.",
      "",
      "78   const id: string = req.params.id;",
      "           ~~",
      "",
      "\x1b[96msrc/db/client.ts\x1b[0m:\x1b[93m19\x1b[0m:\x1b[93m3\x1b[0m - \x1b[91merror\x1b[0m \x1b[90mTS2741:\x1b[0m Property 'ssl' is missing in type '{ host: string; port: number; }' but required in type 'PoolConfig'.",
      "",
      "19   return createPool({ host, port });",
      "     ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~",
      "",
      "Found 3 errors in 2 files.",
      "",
      "Errors  Files",
      "     2  src/api/users.ts:42",
      "     1  src/db/client.ts:19",
    ].join("\n"),
  },
  {
    name: "ESLint (3 errors, 18 warnings)",
    command: "npx eslint src/",
    exitCode: 1,
    output: [
      "/workspace/app/src/components/Dashboard.tsx",
      "  12:7   error    'unusedVar' is assigned a value but never used    @typescript-eslint/no-unused-vars",
      ...Array.from(
        { length: 12 },
        (_, i) => `  ${20 + i}:5  warning  Unexpected any. Specify a different type         @typescript-eslint/no-explicit-any`
      ),
      "",
      "/workspace/app/src/utils/format.ts",
      "  8:14   error    Unexpected console statement                        no-console",
      "  24:3   error    Missing return type on function                     @typescript-eslint/explicit-function-return-type",
      ...Array.from(
        { length: 6 },
        (_, i) => `  ${30 + i}:9  warning  Prefer const over let                             prefer-const`
      ),
      "",
      "✖ 21 problems (3 errors, 18 warnings)",
      "  6 warnings potentially fixable with the `--fix` option.",
    ].join("\n"),
  },
  {
    name: "npm install (noisy)",
    command: "npm install",
    exitCode: 0,
    output: [
      ...Array.from(
        { length: 18 },
        (_, i) => `npm warn deprecated legacy-pkg-${i}@1.${i}.0: Please upgrade to v3 for security fixes`
      ),
      "npm warn EBADENGINE Unsupported engine { package: 'old-tool@2.1.0', required: { node: '18' }, current: { node: 'v22.22.3' } }",
      "",
      "added 312 packages, and audited 313 packages in 14s",
      "",
      "89 packages are looking for funding",
      "  run `npm fund` for details",
      "",
      "2 moderate severity vulnerabilities",
      "",
      "To address all issues, run:",
      "  npm audit fix",
      "",
      "Run `npm audit` for details.",
    ].join("\n"),
  },
  {
    name: "git diff (code + lockfile)",
    command: "git diff",
    exitCode: 0,
    output: [
      "diff --git a/package-lock.json b/package-lock.json",
      "index 8b13789..9a22411 100644",
      "--- a/package-lock.json",
      "+++ b/package-lock.json",
      "@@ -1024,180 +1024,185 @@",
      ...Array.from(
        { length: 160 },
        (_, i) => `+    "node_modules/subdep-${i}": { "version": "1.2.${i}", "integrity": "sha512-abcdef1234567890" },`
      ),
      "diff --git a/src/auth/session.ts b/src/auth/session.ts",
      "index 1234567..89abcdef 100644",
      "--- a/src/auth/session.ts",
      "+++ b/src/auth/session.ts",
      "@@ -14,7 +14,8 @@ export function isExpired(exp: number): boolean {",
      "   const now = Math.floor(Date.now() / 1000);",
      "   // Check expiration with 30s leeway",
      "-  return exp < now;",
      "+  return exp < now - 30;",
      " }",
    ].join("\n"),
  },
];

let totalRaw = 0;
let totalCompressed = 0;

console.log("| Scenario | Parser | Raw Tokens | Skim Tokens | Saved |");
console.log("| :--- | :--- | ---: | ---: | ---: |");

for (const c of cases) {
  const res = compressOutput({
    command: c.command,
    stdout: c.output,
    stderr: "",
    exitCode: c.exitCode,
  });
  totalRaw += res.rawTokens;
  totalCompressed += res.compressedTokens;
  console.log(
    `| ${c.name} | \`${res.parser}\` | ${res.rawTokens.toLocaleString()} | ${res.compressedTokens.toLocaleString()} | **-${res.savedPercent}%** |`
  );
}

const totalSaved = totalRaw - totalCompressed;
const totalPct = ((totalSaved / totalRaw) * 100).toFixed(1);
console.log(
  `| **Total** | — | **${totalRaw.toLocaleString()}** | **${totalCompressed.toLocaleString()}** | **-${totalPct}%** |`
);
