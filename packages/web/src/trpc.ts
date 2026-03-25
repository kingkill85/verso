import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink, TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { AppRouter } from "@verso/server";
import { getAccessToken, isTokenExpired, refreshTokens } from "./lib/auth.js";

export const trpc = createTRPCReact<AppRouter>();

// Proactive token refresh — refresh BEFORE it expires
let refreshPromise: Promise<boolean> | null = null;

async function ensureFreshToken(): Promise<string | null> {
  const token = getAccessToken();
  if (!token) return null;

  // If token expires in < 2 minutes, refresh proactively
  if (isTokenExpired(token) || willExpireSoon(token, 120)) {
    if (!refreshPromise) {
      refreshPromise = refreshTokens().finally(() => { refreshPromise = null; });
    }
    await refreshPromise;
    return getAccessToken();
  }
  return token;
}

function willExpireSoon(token: string, secondsThreshold: number): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 < Date.now() + secondsThreshold * 1000;
  } catch { return true; }
}

function retryLink(): TRPCLink<AppRouter> {
  return (runtime) => (opts) => {
    return observable((observer) => {
      let attempted = false;
      const execute = () => {
        const sub = opts.next(opts.op).subscribe({
          next(value) {
            observer.next(value);
          },
          error(err) {
            if (
              !attempted &&
              err instanceof TRPCClientError &&
              (err.data as any)?.httpStatus === 401
            ) {
              attempted = true;
              refreshTokens().then((ok) => {
                if (ok) {
                  execute();
                } else {
                  observer.error(err);
                }
              });
            } else {
              observer.error(err);
            }
          },
          complete() {
            observer.complete();
          },
        });
        return sub;
      };
      const sub = execute();
      return () => sub.unsubscribe();
    });
  };
}

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      retryLink(),
      httpBatchLink({
        url: "/trpc",
        async headers() {
          const token = await ensureFreshToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}
