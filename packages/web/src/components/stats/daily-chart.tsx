import { useTranslation } from "react-i18next";

interface DailyChartProps {
  data: { date: string; minutes: number }[];
  range: "week" | "month" | "year" | "all";
}

function getDayLabel(dateStr: string, range: DailyChartProps["range"]): string {
  const d = new Date(dateStr + "T00:00:00");
  if (range === "week") {
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  }
  return String(d.getDate());
}

export function DailyChart({ data, range }: DailyChartProps) {
  const { t } = useTranslation();
  const WIDTH = 560;
  const HEIGHT = 140;
  const BAR_RADIUS = 3;
  const LABEL_HEIGHT = 20;
  const chartHeight = HEIGHT - LABEL_HEIGHT;

  const isEmpty = data.length === 0;
  const maxMinutes = isEmpty ? 1 : Math.max(...data.map((d) => d.minutes), 1);

  // Show only every Nth label when there are many bars
  const showLabelEvery = data.length > 60 ? 7 : data.length > 30 ? 3 : 1;

  const barWidth = data.length > 0 ? Math.max(2, Math.floor((WIDTH / data.length) * 0.7)) : 10;
  const barGap = data.length > 0 ? WIDTH / data.length : 16;

  return (
    <div
      className="rounded-xl p-4"
      style={{ backgroundColor: "var(--card)" }}
    >
      <p className="text-sm font-medium mb-3" style={{ color: "var(--text)" }}>
        {t("stats.dailyReading")}
      </p>

      {isEmpty ? (
        <div
          className="flex items-center justify-center"
          style={{ height: HEIGHT, color: "var(--text-faint)", fontSize: 13 }}
        >
          {t("stats.noReadingData")}
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full"
          style={{ height: HEIGHT }}
          aria-label="Daily reading bar chart"
        >
          {data.map((item, i) => {
            const barH = Math.max(2, (item.minutes / maxMinutes) * chartHeight);
            const x = i * barGap + (barGap - barWidth) / 2;
            const y = chartHeight - barH;
            const showLabel = i % showLabelEvery === 0;

            return (
              <g key={item.date}>
                <title>{`${item.date}: ${item.minutes} min`}</title>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barH}
                  rx={BAR_RADIUS}
                  ry={BAR_RADIUS}
                  fill="var(--warm)"
                  opacity={0.85}
                />
                {showLabel && (
                  <text
                    x={x + barWidth / 2}
                    y={HEIGHT - 2}
                    textAnchor="middle"
                    fontSize={9}
                    fill="var(--text-faint)"
                  >
                    {getDayLabel(item.date, range)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
