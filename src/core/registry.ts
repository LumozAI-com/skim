import { builtinParsers } from "../parsers/index.js";
import { countLines, countTokens, stripAnsi } from "./tokens.js";
import type { CompressInput, CompressResult, OutputParser } from "./types.js";

/**
 * Compression is only used when it beats the raw output by at least this
 * fraction, including the footer. Below that, the agent gets the (ANSI-stripped)
 * raw output: it's cheaper or about the same, and nothing is lost.
 */
export const MIN_SAVING_RATIO = 0.1;

/** Representative footer, used to charge the footer's cost before a run id exists. */
const FOOTER_TEMPLATE = "[skim run_000000 · 9999 lines · exit 1]";

export function compressOutput(
  input: CompressInput,
  parsers: OutputParser[] = builtinParsers
): CompressResult {
  const combinedRaw = [input.stdout, input.stderr].filter(Boolean).join("\n");
  const cleanOutput = stripAnsi(combinedRaw);

  const parser =
    parsers.find((p) => p.match(input.command, cleanOutput)) ??
    parsers[parsers.length - 1];

  const parsed = parser.parse(input, cleanOutput).trim();
  const rawTokens = countTokens(combinedRaw);
  const footerTokens = countTokens(FOOTER_TEMPLATE);
  const parsedTotal = countTokens(parsed) + footerTokens;

  // Pass through when compressing wouldn't really save anything.
  const passthrough = parsedTotal > rawTokens * (1 - MIN_SAVING_RATIO);
  const summary = passthrough ? cleanOutput.trim() : parsed;
  const compressedTokens = passthrough
    ? countTokens(summary) + (input.exitCode !== 0 ? countTokens("[exit 1]") : 0)
    : parsedTotal;

  const savedTokens = Math.max(0, rawTokens - compressedTokens);
  const savedPercent =
    rawTokens > 0 ? Math.round((savedTokens / rawTokens) * 1000) / 10 : 0;

  return {
    parser: parser.name,
    summary,
    passthrough,
    rawTokens,
    compressedTokens,
    savedTokens,
    savedPercent,
    rawLines: countLines(cleanOutput),
    compressedLines: countLines(summary),
    exitCode: input.exitCode,
  };
}
