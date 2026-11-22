import type { CompressInput, OutputParser } from "../core/types.js";

const ERROR_LINE_REGEX =
  /\b(error|err!|fail|failed|exception|traceback|panic|fatal|unhandled|cannot find|syntaxerror|typeerror|referenceerror)\b/i;

export const genericParser: OutputParser = {
  name: "generic",

  match(): boolean {
    return true;
  },

  parse(input: CompressInput, cleanOutput: string): string {
    const rawLines = cleanOutput
      .split("\n")
      .map((l) => l.trimEnd());

    // Collapse consecutive duplicate lines and empty streaks
    const deduped: string[] = [];
    let repeatCount = 1;

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      if (i > 0 && line === rawLines[i - 1]) {
        if (line.trim() === "") continue; // collapse multiple blank lines
        repeatCount++;
      } else {
        if (repeatCount > 1 && deduped.length > 0) {
          deduped[deduped.length - 1] += ` (x${repeatCount})`;
        }
        repeatCount = 1;
        deduped.push(line);
      }
    }
    if (repeatCount > 1 && deduped.length > 0) {
      deduped[deduped.length - 1] += ` (x${repeatCount})`;
    }

    const nonEmpty = deduped.filter((l) => l.trim().length > 0);
    if (nonEmpty.length === 0) {
      return input.exitCode === 0 ? "OK (no output)" : `FAIL (exit ${input.exitCode}, no output)`;
    }

    // Short outputs don't need heavy truncation
    if (nonEmpty.length <= 25) {
      return nonEmpty.join("\n");
    }

    // Extract high-signal error lines if command failed or errors exist
    const errorLines = nonEmpty.filter((l) => ERROR_LINE_REGEX.test(l));
    if (input.exitCode !== 0 && errorLines.length > 0) {
      const head = nonEmpty.slice(0, 4);
      const pickedErrors = Array.from(new Set(errorLines)).slice(0, 18);
      const tail = nonEmpty.slice(-5);
      const combined = Array.from(new Set([...head, ...pickedErrors, ...tail]));
      const omitted = Math.max(0, nonEmpty.length - combined.length);
      return [
        `FAIL (exit ${input.exitCode})`,
        ...combined,
        ...(omitted > 0 ? [`... (${omitted} lines omitted; use inspect_log)`] : []),
      ].join("\n");
    }

    // Otherwise keep head + tail
    const head = nonEmpty.slice(0, 8);
    const tail = nonEmpty.slice(-12);
    const omitted = nonEmpty.length - head.length - tail.length;
    return [
      ...head,
      `... (${omitted} lines omitted; use inspect_log)`,
      ...tail,
    ].join("\n");
  },
};
