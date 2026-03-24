import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { getAccessToken, setTokens, clearTokens, isTokenExpired } from "@/lib/auth";
import { trpc } from "@/trpc";
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
  const hasToken = !!getAccessToken() && !isTokenExpired(getAccessToken()!);
  const meQuery = trpc.auth.me.useQuery(undefined, { enabled: hasToken, retry: false });

  const [user, setUser] = useState<SafeUser | null>(null);
  const isLoading = hasToken && meQuery.isLoading;

  useEffect(() => {
    if (meQuery.data) {
      setUser(meQuery.data);
    }
    if (meQuery.error) {
      clearTokens();
      setUser(null);
    }
  }, [meQuery.data, meQuery.error]);

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
