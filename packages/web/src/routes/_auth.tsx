import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/trpc";

export const Route = createFileRoute("/_auth")({
  component: AuthLayout,
});

function AuthLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const hasUsersQuery = trpc.auth.hasUsers.useQuery();

  if (isLoading || hasUsersQuery.isLoading) return null;
  if (isAuthenticated) return <Navigate to="/" />;

  if (hasUsersQuery.data && !hasUsersQuery.data.hasUsers) {
    return <Navigate to="/setup" />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: "var(--bg)" }}>
      <Outlet />
    </div>
  );
}
