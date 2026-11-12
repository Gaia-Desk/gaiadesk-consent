/**
 * A refusal. `code` is stable and meant for your code (`bad_config`,
 * `no_bridge`, `already_open`, `closed`, or a bridge's own code such as the
 * server's `already_recorded`); `message` is for people.
 */
export class ConsentError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ConsentError';
    this.code = code;
  }

  /** Any rejection as a ConsentError (keeps a `code` it already carries; reads `"<code>: <message>"`). */
  static from(e: unknown): ConsentError {
    if (e instanceof ConsentError) return e;
    const code = (e as { code?: unknown } | null)?.code;
    const text = e instanceof Error ? e.message : String(e);
    if (typeof code === 'string') return new ConsentError(code, text);
    const m = /^([a-z][a-z0-9_]*): ([\s\S]*)$/.exec(text);
    return m ? new ConsentError(m[1], m[2]) : new ConsentError('unknown', text);
  }
}
