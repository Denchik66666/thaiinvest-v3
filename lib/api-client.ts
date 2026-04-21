/**
 * Базовый типизированный клиент для API запросов
 */
async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  // Get token from cookies for server-side requests
  const getToken = () => {
    if (typeof document !== 'undefined') {
      // Client-side - get from document cookie
      const cookies = document.cookie.split(';');
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'token') return value;
      }
    }
    return null;
  };

  const token = getToken();
  
  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token && { "Authorization": `Bearer ${token}` }),
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
