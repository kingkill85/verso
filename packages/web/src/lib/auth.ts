const ACCESS_TOKEN_KEY = "verso-access-token";
const REFRESH_TOKEN_KEY = "verso-refresh-token";

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

export async function refreshTokens(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch("/trpc/auth.refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ json: { refreshToken } }),
    });
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        // Server explicitly rejected — session is dead
        window.dispatchEvent(new Event("verso:auth-failed"));
      }
      return false;
    }
    const data = await res.json();
    const result = data.result?.data?.json;
    if (result?.accessToken && result?.refreshToken) {
      setTokens(result.accessToken, result.refreshToken);
      return true;
    }
    window.dispatchEvent(new Event("verso:auth-failed"));
    return false;
  } catch {
    // Network error (server restart, offline) — DON'T clear tokens.
    // Keep them so we can retry when the server comes back.
    return false;
  }
}
