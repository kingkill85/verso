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

function getCachedUser(): SafeUser | null {
  try {
    const raw = localStorage.getItem("verso-user");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setCachedUser(user: SafeUser | null) {
  if (user) {
    localStorage.setItem("verso-user", JSON.stringify(user));
  } else {
    localStorage.removeItem("verso-user");
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const hasToken = !!getAccessToken();
  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: hasToken,
    retry: 3,
    retryDelay: 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const [user, setUserState] = useState<SafeUser | null>(getCachedUser);
  const isLoading = hasToken && !user && meQuery.isLoading;

  const setUser = useCallback((u: SafeUser | null) => {
    setUserState(u);
    setCachedUser(u);
  }, []);

  useEffect(() => {
    if (meQuery.data) {
      setUser(meQuery.data);
    }
    // Never auto-clear tokens here. Only the logout button clears tokens.
    // The proactive refresh in trpc.ts handles token renewal.
  }, [meQuery.data, setUser]);

  const login = useCallback((response: AuthResponse) => {
    setTokens(response.accessToken, response.refreshToken);
    setUser(response.user);
  }, [setUser]);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, [setUser]);

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
