import { useState } from "react";
import { useTranslation } from "react-i18next";

type AuthFormProps = {
  title: string;
  subtitle: string;
  buttonLabel: string;
  pendingLabel: string;
  onSubmit: (data: { email: string; password: string; displayName: string }) => void;
  isPending: boolean;
  error: string;
  footer?: React.ReactNode;
};

export function AuthForm({
  title,
  subtitle,
  buttonLabel,
  pendingLabel,
  onSubmit,
  isPending,
  error,
  footer,
}: AuthFormProps) {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ email, password, displayName });
  };

  return (
    <div className="w-full max-w-sm mx-auto px-4">
      <div className="text-center mb-8">
        <h1
          className="font-display text-3xl font-bold mb-2"
          style={{ color: "var(--warm)" }}
        >
          {title}
        </h1>
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          {subtitle}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div
            className="text-sm p-3 rounded-lg"
            style={{
              backgroundColor: "rgba(220,38,38,0.1)",
              color: "#ef4444",
            }}
          >
            {error}
          </div>
        )}

        <div>
          <label
            className="block text-xs font-medium uppercase tracking-wider mb-1.5"
            style={{ color: "var(--text-dim)" }}
          >
            {t("auth.displayName")}
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            className="w-full rounded-[10px] border px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--warm)]"
            style={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
              color: "var(--text)",
            }}
          />
        </div>

        <div>
          <label
            className="block text-xs font-medium uppercase tracking-wider mb-1.5"
            style={{ color: "var(--text-dim)" }}
          >
            {t("auth.email")}
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-[10px] border px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--warm)]"
            style={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
              color: "var(--text)",
            }}
          />
        </div>

        <div>
          <label
            className="block text-xs font-medium uppercase tracking-wider mb-1.5"
            style={{ color: "var(--text-dim)" }}
          >
            {t("auth.password")}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full rounded-[10px] border px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--warm)]"
            style={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
              color: "var(--text)",
            }}
          />
          <p
            className="text-xs mt-1"
            style={{ color: "var(--text-faint)" }}
          >
            {t("account.minChars")}
          </p>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-2.5 rounded-full text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
          style={{ backgroundColor: "var(--warm)" }}
        >
          {isPending ? pendingLabel : buttonLabel}
        </button>
      </form>

      {footer}
    </div>
  );
}
