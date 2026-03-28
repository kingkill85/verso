import { useTranslation } from "react-i18next";

const COLORS = [
  "var(--warm)",
  "#6b8f71",
  "#7b8fb0",
  "#b07b8f",
  "#8f8b6b",
  "#888",
];

interface DistributionChartProps {
  data: { author: string; minutes: number; percentage: number }[];
}

export function DistributionChart({ data }: DistributionChartProps) {
  const { t } = useTranslation();
  const isEmpty = data.length === 0;

  return (
    <div
      className="rounded-xl p-4"
      style={{ backgroundColor: "var(--card)" }}
    >
      <p className="text-sm font-medium mb-3" style={{ color: "var(--text)" }}>
        {t("stats.byAuthor")}
      </p>

      {isEmpty ? (
        <div
          className="flex items-center justify-center py-8"
          style={{ color: "var(--text-faint)", fontSize: 13 }}
        >
          {t("stats.noReadingData")}
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((item, i) => (
            <div key={item.author}>
              <div className="flex items-center justify-between mb-1">
                <span
                  className="text-xs truncate max-w-[70%]"
                  style={{ color: "var(--text)" }}
                  title={item.author}
                >
                  {item.author}
                </span>
                <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                  {item.percentage}%
                </span>
              </div>
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ backgroundColor: "var(--border)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${item.percentage}%`,
                    backgroundColor: COLORS[i % COLORS.length],
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
