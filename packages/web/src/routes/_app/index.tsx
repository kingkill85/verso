import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/")({
  component: () => (
    <div>
      <h2 className="font-display text-2xl font-bold" style={{ color: "var(--text)" }}>
        Library
      </h2>
      <p className="mt-2" style={{ color: "var(--text-dim)" }}>
        Your books will appear here.
      </p>
    </div>
  ),
});
