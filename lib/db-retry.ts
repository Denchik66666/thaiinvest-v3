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

/** Краткое сообщение для UI при типичных сбоях подключения к БД (не секреты). */
export function formatDbAccessErrorForClient(error: unknown): string | null {
  const text = flattenDbErrorText(error);
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  if (code === "EACCES" || /\bEACCES\b/i.test(text)) {
    return "База данных недоступна (отказ в доступе). Запустите PostgreSQL, проверьте DATABASE_URL в .env.local; при Docker — том с данными и права.";
  }
  if (
    /\bECONNREFUSED\b/i.test(text) ||
    code === "P1001" ||
    text.includes("Can't reach database") ||
    text.includes("не удалось подключиться")
  ) {
    return "Не удаётся подключиться к базе данных. Убедитесь, что PostgreSQL запущен и хост/порт в DATABASE_URL верны.";
  }
  if (text.includes("DATABASE_URL is required") || text.includes("Unsupported DATABASE_URL")) {
    return "Не задан или неверный DATABASE_URL. Скопируйте строку подключения в .env.local (см. README).";
  }
  if (/\bENOTFOUND\b/i.test(text) || text.includes("getaddrinfo")) {
    return "Хост базы данных не найден (DNS). Проверьте DATABASE_URL.";
  }
  return null;
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
