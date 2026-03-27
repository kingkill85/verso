import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/trpc";
import { AuthForm } from "@/components/auth-form";

export const Route = createFileRoute("/_auth/setup")({
  component: SetupPage,
});

function SetupPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const utils = trpc.useUtils();

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: async (data) => {
      login(data);
      await utils.auth.hasUsers.invalidate();
      navigate({ to: "/home" });
    },
    onError: (err) => setError(err.message),
  });

  return (
    <AuthForm
      title={t("auth.setup.title")}
      subtitle={t("auth.setup.subtitle")}
      buttonLabel={t("auth.setup.button")}
      pendingLabel={t("auth.setup.pending")}
      onSubmit={(data) => {
        setError("");
        registerMutation.mutate(data);
      }}
      isPending={registerMutation.isPending}
      error={error}
    />
  );
}
