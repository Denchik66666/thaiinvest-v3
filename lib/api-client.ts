/**
 * Базовый типизированный клиент для API запросов
 */
async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Произошла ошибка при запросе");
  }

  return data;
}

async function fetchForm<T>(url: string, form: FormData): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    body: form,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Произошла ошибка при запросе");
  }
  return data;
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
