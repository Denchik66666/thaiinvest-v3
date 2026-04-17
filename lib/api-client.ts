/**
 * Базовый типизированный клиент для API запросов
 */
async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(res.ok ? "Некорректный ответ сервера" : "Произошла ошибка при запросе");
  }

  if (!res.ok) {
    const err = (data as { error?: string })?.error;
    throw new Error(err || "Произошла ошибка при запросе");
  }

  return data as T;
}

async function fetchForm<T>(url: string, form: FormData): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    body: form,
    credentials: "include",
  });
  const text = await res.text();
  let data: unknown = {};
  try {
    if (text) data = JSON.parse(text);
  } catch {
    throw new Error("Произошла ошибка при запросе");
  }
  if (!res.ok) {
    const err = (data as { error?: string })?.error;
    throw new Error(err || "Произошла ошибка при запросе");
  }
  return data as T;
}

export const apiClient = {
  get: <T>(url: string) => fetchApi<T>(url, { method: "GET" }),
  post: <T>(url: string, body: unknown) =>
    fetchApi<T>(url, { method: "POST", body: JSON.stringify(body) }),
  postForm: <T>(url: string, form: FormData) => fetchForm<T>(url, form),
  patch: <T>(url: string, body: unknown) =>
    fetchApi<T>(url, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(url: string, body: unknown) =>
    fetchApi<T>(url, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(url: string) => fetchApi<T>(url, { method: "DELETE" }),
};
