import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/trpc";
import { clearTokens } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { isAuthenticated, isLoading, logout } = useAuth();
  const hasUsersQuery = trpc.auth.hasUsers.useQuery();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading || hasUsersQuery.isLoading) return;

    // DB was wiped — stale token, no users exist
    if (hasUsersQuery.data?.hasUsers === false) {
      logout();
      navigate({ to: "/setup", replace: true });
      return;
    }

    if (!isAuthenticated) {
      navigate({ to: "/login", replace: true });
    }
  }, [isAuthenticated, isLoading, hasUsersQuery.isLoading, hasUsersQuery.data, navigate, logout]);

  if (isLoading || hasUsersQuery.isLoading) return null;
  if (!isAuthenticated || hasUsersQuery.data?.hasUsers === false) return null;
  return <AppShell><Outlet /></AppShell>;
}
