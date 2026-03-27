import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onCancel} />
      <div
        ref={dialogRef}
        className="relative z-10 w-full max-w-sm mx-4 rounded-2xl p-6 shadow-xl"
        style={{ backgroundColor: "var(--surface)" }}
      >
        <h2
          className="font-display text-lg font-semibold mb-2"
          style={{ color: "var(--text)" }}
        >
          {title}
        </h2>
        <p className="text-sm mb-6" style={{ color: "var(--text-dim)" }}>
          {message}
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-full text-sm font-medium border transition-colors hover:opacity-80"
            style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-full text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
            style={{
              backgroundColor: destructive ? "#ef4444" : "var(--warm)",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
