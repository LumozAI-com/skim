export interface CompressInput {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface CompressResult {
  parser: string;
  summary: string;
  /** True when the raw output was returned unchanged because compression didn't save enough. */
  passthrough: boolean;
  rawTokens: number;
  compressedTokens: number;
  savedTokens: number;
  savedPercent: number;
  rawLines: number;
  compressedLines: number;
  exitCode: number;
  runId?: string;
}

export interface OutputParser {
  name: string;
  match(command: string, rawOutput: string): boolean;
  parse(input: CompressInput, cleanOutput: string): string;
}

export interface RunRecord {
  runId: string;
  command: string;
  cwd: string;
  exitCode: number;
  parser: string;
  timestamp: string;
  rawTokens: number;
  compressedTokens: number;
  rawLines: number;
  rawOutput: string;
}

export interface InspectOptions {
  query?: string;
  startLine?: number;
  endLine?: number;
  contextLines?: number;
  maxLines?: number;
}

export interface InspectResult {
  runId: string;
  command: string;
  totalLines: number;
  returnedLines: number;
  content: string;
}

export interface SkimStats {
  totalRuns: number;
  totalRawTokens: number;
  totalCompressedTokens: number;
  totalSavedTokens: number;
  byParser: Record<string, { runs: number; rawTokens: number; compressedTokens: number }>;
}
