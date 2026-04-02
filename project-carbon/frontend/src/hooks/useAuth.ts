"use client";

import { useEffect, useState } from "react";
import { clearToken, getToken } from "@/services/api";

export function useAuth() {
  const [token, setTokenState] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setTokenState(getToken());
    setReady(true);
  }, []);

  return {
    ready,
    token,
    isAuthenticated: Boolean(token),
    logout: () => {
      clearToken();
      setTokenState("");
    }
  };
}