type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
};

function flattenDbErrorText(error: unknown): string {
  const chunks: string[] = [];
  let cur: unknown = error;
  for (let i = 0; i < 10 && cur != null; i += 1) {
    if (cur instanceof Error) {
      chunks.push(cur.message, cur.name);
    } else if (typeof cur === "object") {
      const o = cur as Record<string, unknown>;
      if (typeof o.message === "string") chunks.push(o.message);
      if (typeof o.originalMessage === "string") chunks.push(o.originalMessage);
    }
    chunks.push(String(cur));
    cur =
      typeof cur === "object" && cur !== null && "cause" in cur ? (cur as { cause: unknown }).cause : null;
  }
  return chunks.join("\n");
}

export function isTransientDbError(error: unknown): boolean {
  const text = flattenDbErrorText(error);
  return (
    text.includes("Connection terminated unexpectedly") ||
    text.includes("P1017") ||
    text.includes("P2028") ||
    text.includes("Can't reach database server") ||
    text.includes("statement timeout") ||
    text.includes("57014") ||
    text.includes("ECONNRESET") ||
    text.includes("ETIMEDOUT") ||
    text.includes("too many connections") ||
    text.includes("max client connections") ||
    text.includes("EMAXCONN") ||
    text.includes("EMAXCONNSESSION") ||
    text.includes("max clients reached in session mode") ||
    text.includes("timeout exceeded when trying to connect") ||
    text.includes("EMAXCONN")
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withDbRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(options.attempts ?? 5, 1);
  const baseDelayMs = Math.max(options.baseDelayMs ?? 60, 0);
  let lastError: unknown = null;

  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransientDbError(error) || i >= attempts) {
        throw error;
      }
      await sleep(baseDelayMs * i);
    }
  }

  throw lastError;
}
