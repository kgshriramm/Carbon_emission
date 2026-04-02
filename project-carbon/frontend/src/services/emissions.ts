import { apiFetch } from "./api";

export async function calculateEmissions(payload: unknown) {
  return apiFetch<{ success: boolean; data: unknown }>("/api/emissions/calculate", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function createActivityData(payload: unknown) {
  return apiFetch<{ success: boolean; data: unknown }>("/api/activity-data", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
