import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { formatSkimOutput, runCompressed } from "./core/runner.js";
import { inspectRun } from "./core/store.js";

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: "skim",
    version: "0.1.1",
  });

  server.tool(
    "run_compressed",
    "Run a shell command and return token-compressed output (strips test/build/install noise while keeping failures, errors, and file:line refs). Saves the full raw log locally under a run_id so you can drill in with inspect_log only if needed.",
    {
      command: z.string().describe("Shell command to execute (e.g. 'npm test', 'npx tsc --noEmit', 'pytest')"),
      cwd: z.string().optional().describe("Working directory (defaults to server cwd)"),
      timeoutMs: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Timeout in ms (default 300000 / 5m; pass 0 for no timeout)"),
    },
    async ({ command, cwd, timeoutMs }) => {
      const result = await runCompressed(command, { cwd, timeoutMs });
      return {
        content: [
          {
            type: "text",
            text: formatSkimOutput(result),
          },
        ],
      };
    }
  );

  server.tool(
    "inspect_log",
    "Inspect the saved raw output from a previous run_compressed call by run_id. Filter by keyword query or read a specific line range.",
    {
      runId: z.string().describe("The run_id returned by run_compressed (e.g. 'run_a1b2c3')"),
      query: z.string().optional().describe("Case-insensitive substring to search for in the raw log"),
      startLine: z.number().int().positive().optional().describe("1-based start line to read"),
      endLine: z.number().int().positive().optional().describe("1-based end line to read"),
      contextLines: z.number().int().min(0).max(10).optional().describe("Context lines around query matches (default 2)"),
      maxLines: z.number().int().positive().max(300).optional().describe("Max lines to return (default 80)"),
    },
    async ({ runId, query, startLine, endLine, contextLines, maxLines }) => {
      const inspected = inspectRun(runId, {
        query,
        startLine,
        endLine,
        contextLines,
        maxLines,
      });

      if (!inspected) {
        return {
          content: [
            {
              type: "text",
              text: `Run "${runId}" not found (it may have expired or been pruned).`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `[${inspected.runId} | ${inspected.command} | showing ${inspected.returnedLines}/${inspected.totalLines} lines]\n${inspected.content}`,
          },
        ],
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
