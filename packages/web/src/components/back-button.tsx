import { useTranslation } from "react-i18next";

type BackButtonProps = {
  label?: string;
  className?: string;
};

export function BackButton({ label, className = "mb-4" }: BackButtonProps) {
  const { t } = useTranslation();

  return (
    <button
      onClick={() => window.history.back()}
      className={`inline-flex items-center text-sm transition-colors hover:opacity-80 ${className}`}
      style={{ color: "var(--text-dim)" }}
    >
      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      {label ?? t("common.back")}
    </button>
  );
}
