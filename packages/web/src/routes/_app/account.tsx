import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
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
    <div>
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

const PROVIDER_PRESETS: Record<string, { host: string; port: number; encryption: string }> = {
  gmail: { host: "smtp.gmail.com", port: 465, encryption: "ssl" },
  outlook: { host: "smtp-mail.outlook.com", port: 587, encryption: "starttls" },
  icloud: { host: "smtp.mail.me.com", port: 587, encryption: "starttls" },
  yahoo: { host: "smtp.mail.yahoo.com", port: 465, encryption: "ssl" },
};

function KindleSection() {
  const { t } = useTranslation();
  const [provider, setProvider] = useState("gmail");
  const [host, setHost] = useState("smtp.gmail.com");
  const [port, setPort] = useState(465);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [encryption, setEncryption] = useState("ssl");
  const [kindleEmail, setKindleEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showHelp, setShowHelp] = useState(false);

  const settingsQuery = trpc.kindle.getSettings.useQuery();

  useEffect(() => {
    if (settingsQuery.data) {
      setProvider(settingsQuery.data.provider);
      setHost(settingsQuery.data.host);
      setPort(settingsQuery.data.port);
      setUsername(settingsQuery.data.username);
      setEncryption(settingsQuery.data.encryption);
      setKindleEmail(settingsQuery.data.kindleEmail);
    }
  }, [settingsQuery.data]);

  const saveMut = trpc.kindle.saveSettings.useMutation({
    onSuccess: () => {
      setSuccess(t("kindle.saved"));
      setError("");
      setPassword("");
      settingsQuery.refetch();
    },
    onError: (err) => { setError(err.message); setSuccess(""); },
  });

  const deleteMut = trpc.kindle.deleteSettings.useMutation({
    onSuccess: () => {
      setSuccess(t("kindle.deleted"));
      setError("");
      setPassword("");
      settingsQuery.refetch();
    },
    onError: (err) => { setError(err.message); setSuccess(""); },
  });

  const testMut = trpc.kindle.testConnection.useMutation({
    onSuccess: () => {
      setSuccess(t("kindle.testSuccess"));
      setError("");
    },
    onError: (err) => { setError(err.message); setSuccess(""); },
  });

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    const preset = PROVIDER_PRESETS[newProvider];
    if (preset) {
      setHost(preset.host);
      setPort(preset.port);
      setEncryption(preset.encryption);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!password && !settingsQuery.data) {
      setError(t("kindle.passwordRequired"));
      return;
    }
    saveMut.mutate({
      provider: provider as any,
      host,
      port,
      username,
      password: password || undefined,
      encryption: encryption as any,
      kindleEmail,
    });
  };

  const helpKey = `kindle.help${provider.charAt(0).toUpperCase() + provider.slice(1)}` as any;
  const helpText = provider !== "custom" ? t(helpKey) : null;

  return (
    <div>
      <h2
        className="text-sm font-medium uppercase tracking-wider mb-2"
        style={{ color: "var(--text-dim)" }}
      >
        {t("kindle.title")}
      </h2>
      <p className="text-xs mb-4" style={{ color: "var(--text-faint)" }}>
        {t("kindle.description")}
      </p>

      {error && (
        <div className="text-sm p-3 rounded-lg mb-3" style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#ef4444" }}>
          {error}
        </div>
      )}
      {success && (
        <div className="text-sm p-3 rounded-lg mb-3" style={{ backgroundColor: "rgba(74,138,90,0.1)", color: "var(--green)" }}>
          {success}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-3">
        {/* Provider */}
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: "var(--text-dim)" }}>
            {t("kindle.provider")}
          </label>
          <select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value)}
            className="w-full rounded-[10px] border px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--warm)]"
            style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <option value="gmail">Gmail</option>
            <option value="outlook">Outlook / Hotmail</option>
            <option value="icloud">iCloud</option>
            <option value="yahoo">Yahoo</option>
            <option value="custom">{t("kindle.custom")}</option>
          </select>
        </div>

        {/* App password help */}
        {helpText && (
          <div>
            <button
              type="button"
              onClick={() => setShowHelp(!showHelp)}
              className="text-xs transition-colors hover:opacity-80"
              style={{ color: "var(--warm)" }}
            >
              {t("kindle.appPasswordHelp")} {showHelp ? "▾" : "▸"}
            </button>
            {showHelp && (
              <p className="text-xs mt-1 p-3 rounded-lg" style={{ backgroundColor: "var(--bg)", color: "var(--text-dim)" }}>
                {helpText}
              </p>
            )}
          </div>
        )}

        {/* Host + Port row */}
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: "var(--text-dim)" }}>
              {t("kindle.host")}
            </label>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              required
              className="w-full rounded-[10px] border px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--warm)]"
              style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)" }}
            />
          </div>
          <div className="w-24">
            <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: "var(--text-dim)" }}>
              {t("kindle.port")}
            </label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              required
              className="w-full rounded-[10px] border px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--warm)]"
              style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)" }}
            />
          </div>
        </div>

        {/* Username */}
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: "var(--text-dim)" }}>
            {t("kindle.username")}
          </label>
          <input
            type="email"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="w-full rounded-[10px] border px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--warm)]"
            style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)" }}
          />
        </div>

        {/* Password */}
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: "var(--text-dim)" }}>
            {t("kindle.password")}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={settingsQuery.data ? "••••••••" : ""}
            required={!settingsQuery.data}
            className="w-full rounded-[10px] border px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--warm)]"
            style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)" }}
          />
        </div>

        {/* Encryption */}
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: "var(--text-dim)" }}>
            {t("kindle.encryption")}
          </label>
          <select
            value={encryption}
            onChange={(e) => setEncryption(e.target.value)}
            className="w-full rounded-[10px] border px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--warm)]"
            style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <option value="ssl">SSL/TLS (port 465)</option>
            <option value="starttls">STARTTLS (port 587)</option>
            <option value="none">None</option>
          </select>
        </div>

        {/* Kindle email */}
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: "var(--text-dim)" }}>
            {t("kindle.kindleEmail")}
          </label>
          <input
            type="email"
            value={kindleEmail}
            onChange={(e) => setKindleEmail(e.target.value)}
            placeholder={t("kindle.kindleEmailPlaceholder")}
            required
            className="w-full rounded-[10px] border px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--warm)]"
            style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)" }}
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={saveMut.isPending}
            className="px-5 py-2.5 rounded-full text-sm font-semibold text-white transition-transform hover:scale-[1.02] disabled:opacity-50"
            style={{ backgroundColor: "var(--warm)" }}
          >
            {saveMut.isPending ? t("kindle.saving") : t("kindle.save")}
          </button>
          <button
            type="button"
            onClick={() => {
              setError("");
              setSuccess("");
              testMut.mutate({
                provider: provider as any,
                host,
                port,
                username,
                password,
                encryption: encryption as any,
                kindleEmail,
              });
            }}
            disabled={testMut.isPending || !password}
            className="px-5 py-2.5 rounded-full text-sm font-medium border transition-colors hover:opacity-80 disabled:opacity-50"
            style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
          >
            {testMut.isPending ? t("kindle.testing") : t("kindle.testConnection")}
          </button>
          {settingsQuery.data && (
            <button
              type="button"
              onClick={() => {
                setError("");
                setSuccess("");
                deleteMut.mutate();
              }}
              disabled={deleteMut.isPending}
              className="px-5 py-2.5 rounded-full text-sm font-medium transition-colors hover:opacity-80"
              style={{ color: "#ef4444" }}
            >
              {t("kindle.delete")}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function ChangePasswordSection() {
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
    <div>
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
    </div>
  );
}

function AccountPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"user" | "app" | "kindle">("user");

  return (
    <div className="max-w-sm mx-auto px-4 py-12">
      <h1
        className="font-display text-2xl font-bold mb-6"
        style={{ color: "var(--text)" }}
      >
        {t("account.title")}
      </h1>

      <div
        className="flex gap-6 mb-8 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        {(["user", "app", "kindle"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="pb-2 text-sm font-medium transition-colors"
            style={{
              color: activeTab === tab ? "var(--warm)" : "var(--text-dim)",
              borderBottom: activeTab === tab ? "2px solid var(--warm)" : "2px solid transparent",
              marginBottom: "-1px",
            }}
          >
            {t(`account.tab.${tab}`)}
          </button>
        ))}
      </div>

      {activeTab === "user" && <ChangePasswordSection />}
      {activeTab === "app" && <AppPasswordSection />}
      {activeTab === "kindle" && <KindleSection />}
    </div>
  );
}
