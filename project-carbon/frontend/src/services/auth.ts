import { apiFetch, setToken } from "./api";

type AuthResponse = { success: boolean; data: { token: string } };

export async function login(email: string, password: string) {
  const res = await apiFetch<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  setToken(res.data.token);
  return res;
}

export async function register(fullName: string, email: string, password: string, companyName: string) {
  const res = await apiFetch<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ fullName, email, password, companyName, countryCode: "IN" })
  });
  setToken(res.data.token);
  return res;
}

export async function demoLogin() {
  const res = await apiFetch<AuthResponse>("/api/auth/demo", {
    method: "POST",
    body: JSON.stringify({})
  });
  setToken(res.data.token);
  return res;
}
