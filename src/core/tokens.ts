import { Tiktoken } from "js-tiktoken/lite";
import o200k_base from "js-tiktoken/ranks/o200k_base";

// Strip ANSI CSI/OSC escape sequences and collapse carriage-return progress updates
const ANSI_REGEX =
  // eslint-disable-next-line no-control-regex
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;

export function stripAnsi(text: string): string {
  const noAnsi = text.replace(ANSI_REGEX, "");
  // Collapse carriage-return progress overwrites: keep only the final segment on each line
  return noAnsi
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      if (!line.includes("\r")) return line;
      const parts = line.split("\r").filter((p) => p.length > 0);
      return parts.length > 0 ? parts[parts.length - 1] : "";
    })
    .join("\n");
}

/**
 * Real token count using the o200k_base BPE tokenizer (GPT-4o family).
 * Exact for OpenAI models and a close proxy for Claude and most modern LLMs.
 * The encoder is created lazily on first use, since loading the ranks takes ~100ms.
 */
let encoder: Tiktoken | null = null;

export function countTokens(text: string): number {
  if (!text) return 0;
  if (!encoder) encoder = new Tiktoken(o200k_base);
  return encoder.encode(text).length;
}

/** @deprecated Use countTokens. Kept as an alias so existing SDK callers keep working. */
export const estimateTokens = countTokens;

export function countLines(text: string): number {
  if (!text) return 0;
  return text.split("\n").length;
}
