import type { Vehicle } from "../types";
import { api } from "./api";
import { handleApiError } from "./handleApiError";

export type VehicleEdit = Pick<Vehicle, "make" | "model" | "year" | "status"> & { version: number };

export async function listVehicles() {
  try {
    const { data } = await api.get<Vehicle[]>("/api/vehicles");
    return data;
  } catch (err) {
    handleApiError(err);
  }
}

export async function getVehicle(id: number) {
  try {
    const { data } = await api.get<Vehicle>(`/api/vehicles/${id}`);
    return data;
  } catch (err) {
    handleApiError(err);
  }
}

export async function updateVehicle(id: number, edit: VehicleEdit) {
  try {
    const { data } = await api.put<Vehicle>(`/api/vehicles/${id}`, edit);
    return data;
  } catch (err) {
    handleApiError(err);
  }
}
