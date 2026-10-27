export type ApiError = {
  status: number;
  message: string;
  fields: Record<string, string>;
};

const GENERIC = "Something went wrong. Please try again.";
const MESSAGES: Record<number, string> = {
  401: "Session expired, please sign in again.",
  403: "You don't have permission to edit vehicles.",
  404: "Vehicle not found.",
  409: "This vehicle was updated by someone else. Refresh and try again.",
};

// App registers this; it only acts when a signed-in user hits a 401 (expiry).
let handleUnauthorized: (message: string) => void = () => {};
export function onUnauthorized(handler: typeof handleUnauthorized) {
  handleUnauthorized = handler;
}

export function handleApiError(err: unknown): never {
  // No response at all means the request never reached the server (offline, DNS), so status stays 0.
  const response = (err as { response?: { status: number; data?: { error?: string; fields?: Record<string, unknown> } | null } }).response;
  const status = response?.status ?? 0;

  // 400 body: { error?: string, fields?: { [field]: message } }
  const fields: Record<string, string> = {};
  for (const [name, value] of Object.entries(response?.data?.fields ?? {})) {
    fields[name] = String(value);
  }

  let message = MESSAGES[status] ?? GENERIC;
  if (status === 400) {
    message = Object.keys(fields).length > 0 ? "Please correct the highlighted fields." : (response?.data?.error ?? GENERIC);
  }
  if (status === 401) {
    handleUnauthorized(message);
  }

  throw { status, message, fields };
}
