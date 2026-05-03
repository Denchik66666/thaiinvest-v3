type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
};

export function isTransientDbError(error: unknown): boolean {
  const text = String(error ?? "");
  return (
    text.includes("Connection terminated unexpectedly") ||
    text.includes("P1017") ||
    text.includes("P2028") ||
    text.includes("Can't reach database server") ||
    text.includes("statement timeout") ||
    text.includes("57014") ||
    text.includes("ECONNRESET") ||
    text.includes("ETIMEDOUT") ||
    text.includes("too many connections")
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withDbRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(options.attempts ?? 3, 1);
  const baseDelayMs = Math.max(options.baseDelayMs ?? 250, 0);
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
