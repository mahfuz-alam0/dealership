import type { User } from "../types";
import { api } from "./api";
import { handleApiError } from "./handleApiError";

export async function login(email: string, password: string) {
  try {
    const { data } = await api.post("/api/login", { email, password });
    return data; // session cookie is set by the server via Set-Cookie
  } catch (err) {
    handleApiError(err);
  }
}

export async function logout() {
  try {
    const { data } = await api.post("/api/logout");
    return data;
  } catch (err) {
    handleApiError(err);
  }
}

export async function getMe() {
  try {
    const { data } = await api.get<User>("/api/me");
    return data;
  } catch (err) {
    handleApiError(err);
  }
}
