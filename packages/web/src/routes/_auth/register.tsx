import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/trpc";
import { AuthForm } from "@/components/auth-form";

export const Route = createFileRoute("/_auth/register")({
  component: RegisterPage,
});

function RegisterPage() {
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
      title="Verso"
      subtitle="Create your account"
      buttonLabel="Create Account"
      pendingLabel="Creating account..."
      onSubmit={(data) => {
        setError("");
        registerMutation.mutate(data);
      }}
      isPending={registerMutation.isPending}
      error={error}
      footer={
        <p
          className="text-center text-sm mt-6"
          style={{ color: "var(--text-dim)" }}
        >
          Already have an account?{" "}
          <Link to="/login" style={{ color: "var(--warm)" }}>
            Sign in
          </Link>
        </p>
      }
    />
  );
}
