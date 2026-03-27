import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/trpc";

export const Route = createFileRoute("/_auth")({
  component: AuthLayout,
});

function AuthLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const hasUsersQuery = trpc.auth.hasUsers.useQuery();
  const location = useLocation();
  const navigate = useNavigate();

  const noUsers = hasUsersQuery.data?.hasUsers === false;

  useEffect(() => {
    if (isLoading || hasUsersQuery.isLoading) return;
    if (isAuthenticated) {
      navigate({ to: "/home", replace: true });
      return;
    }
    if (noUsers && location.pathname !== "/setup") {
      navigate({ to: "/setup", replace: true });
    }
  }, [isAuthenticated, isLoading, hasUsersQuery.isLoading, noUsers, location.pathname, navigate]);

  if (isLoading || hasUsersQuery.isLoading) return null;
  if (isAuthenticated) return null;
  if (noUsers && location.pathname !== "/setup") return null;

  return (
    <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: "var(--bg)" }}>
      <Outlet />
    </div>
  );
}
