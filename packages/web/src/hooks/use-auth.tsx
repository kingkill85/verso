import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { getAccessToken, setTokens, clearTokens, isTokenExpired } from "@/lib/auth";
import type { SafeUser, AuthResponse } from "@verso/shared";

type AuthState = {
  user: SafeUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (response: AuthResponse) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || isTokenExpired(token)) {
      setIsLoading(false);
      return;
    }

    fetch("/trpc/auth.me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.result?.data?.json) {
          setUser(data.result.data.json);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback((response: AuthResponse) => {
    setTokens(response.accessToken, response.refreshToken);
    setUser(response.user);
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
