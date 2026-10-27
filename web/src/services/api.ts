// Tiny fetch client shaped like the axios `api` in our other projects, so the services read the same:
//   const { data } = await api.get("/api/vehicles")
// A non-2xx answer is thrown as { response: { status, data } }, the same shape axios uses.
async function send<T>(method: string, url: string, body?: unknown): Promise<{ data: T }> {
  const response = await fetch(url, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw { response: { status: response.status, data } };
  }
  return { data: data as T };
}

export const api = {
  get: <T = unknown>(url: string) => send<T>("GET", url),
  post: <T = unknown>(url: string, body?: unknown) => send<T>("POST", url, body),
  put: <T = unknown>(url: string, body?: unknown) => send<T>("PUT", url, body),
};
