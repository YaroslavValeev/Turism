"use client";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("admin_token");
}

export function redirectToLogin() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("admin_token");
  window.location.href = "/login";
}

export async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getAdminToken();
  if (!token) {
    redirectToLogin();
    throw new Error("Требуется вход в админ-панель");
  }

  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (response.status === 401) {
    redirectToLogin();
    throw new Error("Сессия истекла");
  }
  return response;
}

export async function adminJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await adminFetch(path, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof data?.error === "string" ? data.error : `Запрос ${response.status} завершился ошибкой`;
    throw new Error(message);
  }
  return data as T;
}
