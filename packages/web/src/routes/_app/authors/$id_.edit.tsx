import { useState, useEffect, useMemo, useRef } from "react";
import { createFileRoute, useNavigate, useBlocker } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { trpc } from "@/trpc";
import { useAuth } from "@/hooks/use-auth";
import { getAccessToken } from "@/lib/auth";

export const Route = createFileRoute("/_app/authors/$id_/edit")({
  component: AuthorEditPage,
});

const ALL_LOCALES = ["en", "de", "es", "fr", "it", "nl", "pt", "zh", "ja", "ko"] as const;

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function hashColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 35%, 35%)`;
}

function AuthorEditPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();
  const authorQuery = trpc.authors.byId.useQuery({ id });

  const [name, setName] = useState("");
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [activeLocale, setActiveLocale] = useState("en");
  const [initialName, setInitialName] = useState("");
  const [initialDescs, setInitialDescs] = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize form from author data ONCE
  useEffect(() => {
    if (!authorQuery.data || initialized) return;
    const author = authorQuery.data;
    setName(author.name);
    setInitialName(author.name);
    const descMap: Record<string, string> = {};
    for (const d of author.descriptions) {
      descMap[d.locale] = d.description;
    }
    setDescriptions(descMap);
    setInitialDescs({ ...descMap });
    setActiveLocale(
      author.descriptions.length > 0 ? author.descriptions[0].locale : "en"
    );
    setInitialized(true);
  }, [authorQuery.data, initialized]);

  const isDirty = useMemo(() => {
    if (name !== initialName) return true;
    const currentKeys = Object.keys(descriptions).filter((k) => descriptions[k]?.trim());
    const initialKeys = Object.keys(initialDescs).filter((k) => initialDescs[k]?.trim());
    if (currentKeys.length !== initialKeys.length) return true;
    return currentKeys.some((k) => descriptions[k] !== initialDescs[k]);
  }, [name, initialName, descriptions, initialDescs]);

  useEffect(() => {
    if (!isDirty || saving) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty, saving]);

  useBlocker({ condition: isDirty && !saving });

  // Redirect non-admins
  useEffect(() => {
    if (user && !isAdmin) {
      navigate({ to: "/authors/$id", params: { id } });
    }
  }, [user, isAdmin, navigate, id]);

  const updateMutation = trpc.authors.update.useMutation();
  const updateDescMutation = trpc.authors.updateDescription.useMutation();

  const localesWithContent = Object.keys(descriptions).filter((l) => descriptions[l]?.trim());
  const availableToAdd = ALL_LOCALES.filter((l) => !localesWithContent.includes(l) && l !== activeLocale);

  const handleSave = async () => {
    if (!authorQuery.data) return;
    setSaving(true);
    try {
      if (name !== initialName) {
        await updateMutation.mutateAsync({ id, name });
      }

      for (const [locale, desc] of Object.entries(descriptions)) {
        if (desc.trim() && desc !== initialDescs[locale]) {
          await updateDescMutation.mutateAsync({
            authorId: id,
            locale,
            description: desc.trim(),
          });
        }
      }

      utils.authors.byId.invalidate({ id });
      utils.authors.list.invalidate();
      navigate({ to: "/authors/$id", params: { id }, replace: true });
    } catch {
      // Error handled by mutation state
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = getAccessToken();
      const res = await fetch(`/api/authors/${id}/photo`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (res.ok) {
        authorQuery.refetch();
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handlePhotoDelete = async () => {
    setDeleting(true);
    try {
      const token = getAccessToken();
      const res = await fetch(`/api/authors/${id}/photo`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        authorQuery.refetch();
      }
    } finally {
      setDeleting(false);
    }
  };

  const addLocale = (locale: string) => {
    setDescriptions((prev) => ({ ...prev, [locale]: "" }));
    setActiveLocale(locale);
  };

  if (!isAdmin) return null;

  if (authorQuery.isLoading) {
    return <div className="flex items-center justify-center py-20" style={{ color: "var(--text-dim)" }}><p className="text-sm">{t("common.loading")}</p></div>;
  }
  if (authorQuery.error || !authorQuery.data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="font-display text-lg" style={{ color: "var(--text)" }}>Author not found</p>
        <button onClick={() => window.history.back()} className="text-sm mt-2" style={{ color: "var(--warm)" }}>{t("common.back")}</button>
      </div>
    );
  }

  const author = authorQuery.data;

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => window.history.back()} className="inline-flex items-center text-sm transition-colors hover:opacity-80" style={{ color: "var(--text-dim)" }}>
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t("edit.backTo", { name: author.name })}
        </button>
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          className="px-5 py-2 rounded-full text-sm font-semibold text-white transition-transform hover:scale-[1.02] disabled:opacity-50"
          style={{ backgroundColor: "var(--warm)" }}
        >
          {saving ? t("authors.saving") : t("authors.save")}
        </button>
      </div>

      {(updateMutation.isError || updateDescMutation.isError) && (
        <div className="rounded-lg px-4 py-3 mb-4 text-sm" style={{ backgroundColor: "rgba(200,50,50,0.1)", color: "#c44" }}>
          {t("authors.saveFailed")}
        </div>
      )}

      <h1 className="font-display text-xl font-bold mb-6" style={{ color: "var(--text)" }}>{t("authors.editAuthor")}</h1>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Photo section */}
        <div className="shrink-0 self-center md:self-start flex flex-col items-center gap-3">
          <div
            className="w-36 h-36 rounded-full flex items-center justify-center text-4xl font-bold text-white overflow-hidden"
            style={{ backgroundColor: hashColor(author.name) }}
          >
            {author.imagePath ? (
              <img
                src={`/api/authors/${author.id}/photo`}
                alt={author.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                  (e.target as HTMLImageElement).parentElement!.textContent = getInitials(author.name);
                }}
              />
            ) : (
              getInitials(author.name)
            )}
          </div>

          <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />

          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:opacity-80"
              style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
            >
              {uploading ? t("authors.uploading") : t("authors.uploadPhoto")}
            </button>
            {author.imagePath && (
              <button
                onClick={handlePhotoDelete}
                disabled={deleting}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:opacity-80"
                style={{ borderColor: "var(--border)", color: "#c44" }}
              >
                {deleting ? t("edit.removing") : t("authors.removePhoto")}
              </button>
            )}
          </div>
        </div>

        {/* Fields */}
        <div className="flex-1 min-w-0 flex flex-col gap-6">
          {/* Name */}
          <div className="rounded-xl p-5" style={{ backgroundColor: "var(--card)" }}>
            <p className="text-xs font-medium uppercase tracking-wider mb-4" style={{ color: "var(--text-faint)" }}>{t("authors.editName")}</p>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
            />
          </div>

          {/* Bio with locale tabs */}
          <div className="rounded-xl p-5" style={{ backgroundColor: "var(--card)" }}>
            <p className="text-xs font-medium uppercase tracking-wider mb-4" style={{ color: "var(--text-faint)" }}>{t("authors.editBio")}</p>
            <div className="flex gap-1 mb-3 flex-wrap">
              {localesWithContent.map((locale) => (
                <button
                  key={locale}
                  onClick={() => setActiveLocale(locale)}
                  className="px-2.5 py-1 rounded text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: activeLocale === locale ? "var(--warm)" : "var(--bg)",
                    color: activeLocale === locale ? "white" : "var(--text-dim)",
                  }}
                >
                  {t(`authors.locale.${locale}`)}
                </button>
              ))}
              {/* Show active tab if it's new and empty */}
              {!localesWithContent.includes(activeLocale) && (
                <button
                  className="px-2.5 py-1 rounded text-xs font-medium"
                  style={{ backgroundColor: "var(--warm)", color: "white" }}
                >
                  {t(`authors.locale.${activeLocale}`)}
                </button>
              )}
              {availableToAdd.length > 0 && (
                <select
                  onChange={(e) => { if (e.target.value) addLocale(e.target.value); e.target.value = ""; }}
                  className="px-2 py-1 rounded text-xs border outline-none"
                  style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)", color: "var(--text-dim)" }}
                  defaultValue=""
                >
                  <option value="" disabled>{t("authors.addLocale")}</option>
                  {availableToAdd.map((l) => (
                    <option key={l} value={l}>{t(`authors.locale.${l}`)}</option>
                  ))}
                </select>
              )}
            </div>
            <textarea
              value={descriptions[activeLocale] ?? ""}
              onChange={(e) => setDescriptions((prev) => ({ ...prev, [activeLocale]: e.target.value }))}
              rows={6}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none resize-none"
              style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
