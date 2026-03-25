import type { SmartFilter, SmartFilterCondition } from "@verso/shared";

type FilterBuilderProps = {
  filter: SmartFilter;
  onChange: (filter: SmartFilter) => void;
};

const FIELDS: { value: SmartFilterCondition["field"]; label: string }[] = [
  { value: "title", label: "Title" },
  { value: "author", label: "Author" },
  { value: "genre", label: "Genre" },
  { value: "tags", label: "Tags" },
  { value: "year", label: "Year" },
  { value: "language", label: "Language" },
  { value: "fileFormat", label: "Format" },
  { value: "pageCount", label: "Page Count" },
];

const OPS: { value: SmartFilterCondition["op"]; label: string }[] = [
  { value: "eq", label: "equals" },
  { value: "neq", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "gt", label: "greater than" },
  { value: "gte", label: "at least" },
  { value: "lt", label: "less than" },
  { value: "lte", label: "at most" },
];

const defaultCondition: SmartFilterCondition = { field: "title", op: "contains", value: "" };

export function FilterBuilder({ filter, onChange }: FilterBuilderProps) {
  const updateCondition = (index: number, patch: Partial<SmartFilterCondition>) => {
    const next = [...filter.conditions];
    next[index] = { ...next[index], ...patch };
    onChange({ ...filter, conditions: next });
  };

  const addCondition = () => {
    onChange({ ...filter, conditions: [...filter.conditions, { ...defaultCondition }] });
  };

  const removeCondition = (index: number) => {
    if (filter.conditions.length <= 1) return;
    const next = filter.conditions.filter((_, i) => i !== index);
    onChange({ ...filter, conditions: next });
  };

  const toggleOperator = () => {
    onChange({ ...filter, operator: filter.operator === "AND" ? "OR" : "AND" });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-medium" style={{ color: "var(--text-dim)" }}>Match</span>
        <button
          type="button"
          onClick={toggleOperator}
          className="px-2 py-0.5 rounded text-xs font-semibold transition-colors"
          style={{ backgroundColor: "var(--warm-glow)", color: "var(--warm)" }}
        >
          {filter.operator}
        </button>
        <span className="text-xs" style={{ color: "var(--text-dim)" }}>of the following</span>
      </div>

      {filter.conditions.map((cond, i) => (
        <div key={i} className="flex items-center gap-2">
          <select
            value={cond.field}
            onChange={(e) => updateCondition(i, { field: e.target.value as SmartFilterCondition["field"] })}
            className="rounded-lg border px-2 py-1.5 text-xs outline-none"
            style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            {FIELDS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>

          <select
            value={cond.op}
            onChange={(e) => updateCondition(i, { op: e.target.value as SmartFilterCondition["op"] })}
            className="rounded-lg border px-2 py-1.5 text-xs outline-none"
            style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            {OPS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <input
            type="text"
            value={String(cond.value)}
            onChange={(e) => updateCondition(i, { value: e.target.value })}
            placeholder="value"
            className="flex-1 rounded-lg border px-2 py-1.5 text-xs outline-none"
            style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)" }}
          />

          <button
            type="button"
            onClick={() => removeCondition(i)}
            disabled={filter.conditions.length <= 1}
            className="w-6 h-6 flex items-center justify-center rounded text-xs transition-colors hover:opacity-80"
            style={{ color: filter.conditions.length <= 1 ? "var(--text-faint)" : "var(--text-dim)" }}
          >
            x
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addCondition}
        className="self-start text-xs font-medium transition-colors hover:opacity-80"
        style={{ color: "var(--warm)" }}
      >
        + Add condition
      </button>
    </div>
  );
}
