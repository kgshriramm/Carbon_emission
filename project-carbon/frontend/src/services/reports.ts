import { apiFetch } from "./api";

export async function generateReport(payload: unknown) {
  return apiFetch<{ success: boolean; data: { reportId: number } }>("/api/reports/generate", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateReportStatus(reportId: number, status: string, submittedReference?: string) {
  return apiFetch<{ success: boolean; data: unknown }>(`/api/reports/${reportId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, submittedReference })
  });
}

export async function me() {
  return apiFetch<{ success: boolean; data: unknown }>("/api/auth/me", { method: "GET" });
}
