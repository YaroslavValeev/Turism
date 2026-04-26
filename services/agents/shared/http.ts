import axios, { type AxiosRequestConfig } from "axios";

export function createApiClient() {
  const baseURL = (process.env.API_URL ?? "http://localhost:3001").replace(/\/$/, "");
  const token = process.env.INTERNAL_ANALYTICS_TOKEN;
  if (!token) {
    throw new Error("INTERNAL_ANALYTICS_TOKEN не задан (нужен тот же токен, что у API для /internal/analytics)");
  }
  return axios.create({
    baseURL,
    timeout: 60_000,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function getJson<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const client = createApiClient();
  const { data } = await client.get<T>(url, config);
  return data;
}
