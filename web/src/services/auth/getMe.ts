import type { User } from "../../types";
import { api } from "../api";
import { handleApiError } from "../handleApiError";

export async function getMe() {
  try {
    const { data } = await api.get<User>("/api/me");
    return data;
  } catch (err) {
    handleApiError(err);
  }
}
