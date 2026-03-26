import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { OpdsImport } from "@/components/import/opds-import";
import { RestoreBackup } from "@/components/import/restore-backup";

export const Route = createFileRoute("/_app/import")({
  component: ImportPage,
});

type Tab = "opds" | "restore";

const TABS: { value: Tab; label: string }[] = [
  { value: "opds", label: "OPDS Import" },
  { value: "restore", label: "Restore Backup" },
];

function ImportPage() {
  const [tab, setTab] = useState<Tab>("opds");

  return (
    <div className="max-w-2xl mx-auto">
      <h1
        className="font-display text-[26px] font-bold mb-6"
        style={{ color: "var(--text)" }}
      >
        Import
      </h1>

      {/* Tab selector */}
      <div
        className="inline-flex gap-1 p-1 rounded-xl mb-6"
        style={{ backgroundColor: "var(--card)" }}
      >
        {TABS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={
              tab === value
                ? { backgroundColor: "var(--warm)", color: "#fff" }
                : { color: "var(--text-dim)" }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "opds" ? <OpdsImport /> : <RestoreBackup />}
    </div>
  );
}
