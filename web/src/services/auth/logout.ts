import { api } from "../api";
import { handleApiError } from "../handleApiError";

export async function logout() {
  try {
    const { data } = await api.post("/api/logout");
    return data;
  } catch (err) {
    handleApiError(err);
  }
}
