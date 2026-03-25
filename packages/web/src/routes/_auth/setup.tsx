import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/trpc";
import { AuthForm } from "@/components/auth-form";

export const Route = createFileRoute("/_auth/setup")({
  component: SetupPage,
});

function SetupPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: (data) => {
      login(data);
      navigate({ to: "/" });
    },
    onError: (err) => setError(err.message),
  });

  return (
    <AuthForm
      title="Welcome to Verso"
      subtitle="Create your admin account to get started"
      buttonLabel="Get Started"
      pendingLabel="Setting up..."
      onSubmit={(data) => {
        setError("");
        registerMutation.mutate(data);
      }}
      isPending={registerMutation.isPending}
      error={error}
    />
  );
}
