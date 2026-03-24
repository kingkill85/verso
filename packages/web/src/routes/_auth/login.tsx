import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/login")({
  component: () => (
    <div className="w-full max-w-sm">
      <h1 className="font-display text-2xl font-bold text-center mb-6" style={{ color: "var(--text)" }}>
        Sign in to Verso
      </h1>
      <p className="text-center" style={{ color: "var(--text-dim)" }}>
        Login form coming soon.
      </p>
    </div>
  ),
});
