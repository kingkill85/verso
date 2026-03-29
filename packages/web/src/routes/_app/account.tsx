import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/trpc";

export const Route = createFileRoute("/_app/account")({
  component: AccountPage,
});

function AppPasswordSection() {
  const { t } = useTranslation();
  const [appPassword, setAppPassword] = useState("");
  const [appError, setAppError] = useState("");
  const [appSuccess, setAppSuccess] = useState("");

  const status = trpc.appPassword.status.useQuery();
  const setPasswordMut = trpc.appPassword.set.useMutation({
    onSuccess: () => {
      setAppSuccess(t("account.appPassword.set"));
      setAppPassword("");
      setAppError("");
      status.refetch();
    },
    onError: (err) => { setAppError(err.message); setAppSuccess(""); },
  });
  const clearMut = trpc.appPassword.clear.useMutation({
    onSuccess: () => {
      setAppSuccess(t("account.appPassword.cleared"));
      setAppError("");
      status.refetch();
    },
    onError: (err) => { setAppError(err.message); setAppSuccess(""); },
  });

  const handleSet = (e: React.FormEvent) => {
    e.preventDefault();
    setAppError("");
    setAppSuccess("");
    if (appPassword.length < 8) {
      setAppError(t("account.tooShort"));
      return;
    }
    setPasswordMut.mutate({ password: appPassword });
  };

  return (
    <div className="mt-10">
      <h2
        className="text-sm font-medium uppercase tracking-wider mb-2"
        style={{ color: "var(--text-dim)" }}
      >
        {t("account.appPassword.title")}
      </h2>
      <p className="text-xs mb-4" style={{ color: "var(--text-faint)" }}>
        {t("account.appPassword.description")}
      </p>

      {appError && (
        <div className="text-sm p-3 rounded-lg mb-3" style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#ef4444" }}>
          {appError}
        </div>
      )}
      {appSuccess && (
        <div className="text-sm p-3 rounded-lg mb-3" style={{ backgroundColor: "rgba(74,138,90,0.1)", color: "var(--green)" }}>
          {appSuccess}
        </div>
      )}

      {status.data?.hasPassword && (
        <div className="flex items-center justify-between mb-3 p-3 rounded-lg" style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}>
          <span className="text-sm" style={{ color: "var(--text)" }}>{t("account.appPassword.active")}</span>
          <button
            onClick={() => { setAppError(""); setAppSuccess(""); clearMut.mutate(); }}
            disabled={clearMut.isPending}
            className="text-xs px-3 py-1.5 rounded-full transition-colors"
            style={{ color: "#ef4444", backgroundColor: "rgba(220,38,38,0.1)" }}
          >
            {clearMut.isPending ? "..." : t("account.appPassword.clearBtn")}
          </button>
        </div>
      )}

      <form onSubmit={handleSet} className="flex gap-2">
        <input
          type="password"
          value={appPassword}
          onChange={(e) => setAppPassword(e.target.value)}
          placeholder={status.data?.hasPassword ? t("account.appPassword.changePlaceholder") : t("account.appPassword.setPlaceholder")}
          minLength={8}
          className="flex-1 rounded-[10px] border px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--warm)]"
          style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)" }}
        />
        <button
          type="submit"
          disabled={setPasswordMut.isPending || !appPassword}
          className="px-5 py-2.5 rounded-full text-sm font-semibold text-white transition-transform hover:scale-[1.02] disabled:opacity-50"
          style={{ backgroundColor: "var(--warm)" }}
        >
          {setPasswordMut.isPending ? "..." : t("account.appPassword.saveBtn")}
        </button>
      </form>
      <p className="text-xs mt-1.5" style={{ color: "var(--text-faint)" }}>
        {t("account.minChars")}
      </p>
    </div>
  );
}

function AccountPage() {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setError("");
    },
    onError: (err) => {
      setError(err.message);
      setSuccess(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError(t("account.mismatch"));
      return;
    }

    if (newPassword.length < 8) {
      setError(t("account.tooShort"));
      return;
    }

    changePassword.mutate({ currentPassword, newPassword });
  };

  return (
    <div className="max-w-sm mx-auto px-4 py-12">
      <h1
        className="font-display text-2xl font-bold mb-8"
        style={{ color: "var(--text)" }}
      >
        {t("account.title")}
      </h1>

      <h2
        className="text-sm font-medium uppercase tracking-wider mb-4"
        style={{ color: "var(--text-dim)" }}
      >
        {t("account.changePassword")}
      </h2>

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

        {success && (
          <div
            className="text-sm p-3 rounded-lg"
            style={{
              backgroundColor: "rgba(74,138,90,0.1)",
              color: "var(--green)",
            }}
          >
            {t("account.changed")}
          </div>
        )}

        <div>
          <label
            className="block text-xs font-medium uppercase tracking-wider mb-1.5"
            style={{ color: "var(--text-dim)" }}
          >
            {t("account.currentPassword")}
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
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
            {t("account.newPassword")}
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
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
            {t("account.confirmPassword")}
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
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
          disabled={changePassword.isPending}
          className="w-full py-2.5 rounded-full text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
          style={{ backgroundColor: "var(--warm)" }}
        >
          {changePassword.isPending ? t("account.changing") : t("account.changeBtn")}
        </button>
      </form>

      <AppPasswordSection />
    </div>
  );
}
