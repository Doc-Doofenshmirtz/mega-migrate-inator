import { execa, type Options as ExecaOptions } from "execa";
import { redact } from "./redact.js";
import { logger } from "./logger.js";
import { emitEvent } from "./events.js";

export class RedactedExecError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number | undefined,
    public readonly stdoutTail: string,
    public readonly stderrTail: string,
  ) {
    super(message);
    this.name = "RedactedExecError";
  }
}

function tail(s: string, lines = 40): string {
  const parts = s.split(/\r?\n/);
  return parts.slice(-lines).join("\n");
}

/** Emits each complete line from a child process stream through the event bridge, redacted. */
function streamLines(stream: NodeJS.ReadableStream | null | undefined): void {
  if (!stream) return;
  let buffer = "";
  stream.on("data", (chunk: Buffer | string) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.length === 0) continue;
      emitEvent({ type: "log", level: "debug", line: redact(line) });
    }
  });
}

/**
 * Runs a command via execa, scrubbing secrets from every log line and from
 * any error thrown. Never log `args` or output unredacted — callers must
 * register secrets with the global redactor before invoking commands that
 * embed them (e.g. clone URLs with tokens).
 *
 * Streams stdout/stderr line-by-line through the event bridge as the process
 * runs (in addition to returning the full buffered output on completion),
 * so long-running commands like `git push --mirror` surface live progress.
 */
export async function run(
  file: string,
  args: string[],
  options: ExecaOptions & { label?: string } = {},
): Promise<{ stdout: string; stderr: string }> {
  const label = options.label ?? file;
  logger.debug({ cmd: redact(`${file} ${args.join(" ")}`) }, `exec: ${label}`);

  const subprocess = execa(file, args, {
    ...options,
    reject: true,
    env: { ...process.env, ...(options.env ?? {}) },
  });
  streamLines(subprocess.stdout);
  streamLines(subprocess.stderr);

  try {
    const result = await subprocess;
    return {
      stdout: typeof result.stdout === "string" ? result.stdout : "",
      stderr: typeof result.stderr === "string" ? result.stderr : "",
    };
  } catch (err: any) {
    const stdout = redact(String(err.stdout ?? ""));
    const stderr = redact(String(err.stderr ?? ""));
    const msg = redact(`${label} failed (exit ${err.exitCode ?? "?"}): ${err.shortMessage ?? err.message ?? ""}`);
    throw new RedactedExecError(msg, err.exitCode, tail(stdout), tail(stderr));
  }
}

export async function commandExists(cmd: string): Promise<boolean> {
  try {
    await execa(cmd, ["--version"]);
    return true;
  } catch {
    return false;
  }
}
