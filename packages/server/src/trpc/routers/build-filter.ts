import { eq, ne, gt, gte, lt, lte, like, and, or, sql } from "drizzle-orm";
import { books } from "@verso/shared";
import type { SmartFilter, SmartFilterCondition } from "@verso/shared";

function escapeLike(str: string): string {
  return str.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

const columnMap = {
  title: books.title,
  author: books.author,
  genre: books.genre,
  year: books.year,
  language: books.language,
  fileFormat: books.fileFormat,
  pageCount: books.pageCount,
} as const;

function buildCondition(cond: SmartFilterCondition) {
  const { field, op, value } = cond;

  // Tags require special handling — stored as JSON array
  if (field === "tags") {
    const strVal = String(value);
    switch (op) {
      case "eq":
      case "contains":
        return sql`EXISTS (SELECT 1 FROM json_each(${books.tags}) WHERE value = ${strVal})`;
      case "neq":
        return sql`NOT EXISTS (SELECT 1 FROM json_each(${books.tags}) WHERE value = ${strVal})`;
      case "in":
        if (Array.isArray(value)) {
          const conditions = value.map(
            (v) => sql`EXISTS (SELECT 1 FROM json_each(${books.tags}) WHERE value = ${v})`
          );
          return or(...conditions);
        }
        return sql`1=0`;
      default:
        return sql`1=0`;
    }
  }

  const column = columnMap[field as keyof typeof columnMap];
  if (!column) return sql`1=0`;

  switch (op) {
    case "eq": return eq(column, value as any);
    case "neq": return ne(column, value as any);
    case "contains": return like(column, `%${escapeLike(String(value))}%`);
    case "gt": return gt(column, value as any);
    case "gte": return gte(column, value as any);
    case "lt": return lt(column, value as any);
    case "lte": return lte(column, value as any);
    case "in":
      if (Array.isArray(value)) {
        return or(...value.map((v) => eq(column, v as any)));
      }
      return sql`1=0`;
    default: return sql`1=0`;
  }
}

export function buildFilterConditions(filter: SmartFilter) {
  const conditions = filter.conditions.map(buildCondition);
  if (filter.operator === "OR") {
    return or(...conditions);
  }
  return and(...conditions);
}
