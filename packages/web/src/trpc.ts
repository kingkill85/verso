import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink, TRPCClientError, type TRPCLink } from "@trpc/client";
import type { AppRouter } from "@verso/server";
import { getAccessToken, refreshTokens } from "./lib/auth.js";

export const trpc = createTRPCReact<AppRouter>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function retryLink(): TRPCLink<AppRouter> {
  return ((runtime: any) =>
    (opts: any) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      subscribe(observer: any) {
        let attempted = false;
        let inner: any = null;
        const execute = () => {
          inner = runtime(opts).subscribe({
            next(value: unknown) {
              observer.next(value);
            },
            error(err: unknown) {
              if (
                !attempted &&
                err instanceof TRPCClientError &&
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        };
        execute();
        return {
          unsubscribe() {
            inner?.unsubscribe?.();
          },
        };
      },
    })) as unknown as TRPCLink<AppRouter>;
}

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      retryLink(),
      httpBatchLink({
        url: "/trpc",
        async headers() {
          const token = getAccessToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}
