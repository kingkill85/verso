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
      if (res.status === 401) {
        // Server explicitly rejected the refresh token — session is dead
        window.dispatchEvent(new Event("verso:auth-failed"));
      }
      // Any other error (400, 500, etc.) — transient, keep tokens
      return false;
    }
    const data = await res.json();
    const result = data.result?.data?.json;
    if (result?.accessToken && result?.refreshToken) {
      setTokens(result.accessToken, result.refreshToken);
      return true;
    }
    // tRPC returned 200 but no tokens — check if it's an auth error or a transient issue
    const errorCode = data?.error?.data?.httpStatus || data?.[0]?.error?.data?.httpStatus;
    if (errorCode === 401 || errorCode === 403) {
      window.dispatchEvent(new Event("verso:auth-failed"));
    }
    // Otherwise: transient error, keep tokens
    return false;
  } catch {
    // Network error (server restart, offline) — DON'T clear tokens.
    // Keep them so we can retry when the server comes back.
    return false;
  }
}
