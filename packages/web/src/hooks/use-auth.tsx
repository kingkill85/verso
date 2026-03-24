import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
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

function getUserFromToken(): SafeUser | null {
  const token = getAccessToken();
  if (!token || isTokenExpired(token)) {
    clearTokens();
    return null;
  }
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return {
      id: payload.sub,
      email: payload.email,
      displayName: payload.email, // JWT doesn't have displayName, use email as fallback
      role: payload.role,
      avatarUrl: null,
      createdAt: "",
      lastLoginAt: null,
    };
  } catch {
    clearTokens();
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(() => getUserFromToken());

  const login = useCallback((response: AuthResponse) => {
    setTokens(response.accessToken, response.refreshToken);
    setUser(response.user);
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading: false, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
