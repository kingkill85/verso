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

// Single in-flight refresh promise — ALL callers share this.
// Prevents race conditions where multiple 401s each try to rotate the session.
let inflightRefresh: Promise<boolean> | null = null;

export function refreshTokens(): Promise<boolean> {
  if (inflightRefresh) return inflightRefresh;
  inflightRefresh = doRefresh().finally(() => { inflightRefresh = null; });
  return inflightRefresh;
}

async function doRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch("/trpc/auth.refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      // Any non-OK response means refresh is dead — clear and go to login
      window.dispatchEvent(new Event("verso:auth-failed"));
      return false;
    }
    const data = await res.json();
    const result = data?.result?.data;
    if (result?.accessToken && result?.refreshToken) {
      setTokens(result.accessToken, result.refreshToken);
      return true;
    }
    // Got 200 but no tokens — session is dead
    window.dispatchEvent(new Event("verso:auth-failed"));
    return false;
  } catch {
    // Network error — keep tokens so we can retry when server comes back
    return false;
  }
}
