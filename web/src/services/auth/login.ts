import { api } from "../api";
import { handleApiError } from "../handleApiError";

export async function login(email: string, password: string) {
  try {
    const { data } = await api.post("/api/login", { email, password });
    return data; // session cookie is set by the server via Set-Cookie
  } catch (err) {
    handleApiError(err);
  }
}
