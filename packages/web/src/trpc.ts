import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink, TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { AppRouter } from "@verso/server";
import { getAccessToken, refreshTokens } from "./lib/auth.js";

export const trpc = createTRPCReact<AppRouter>();

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
          const token = getAccessToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}
