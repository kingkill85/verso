import { eq, ne, gt, gte, lt, lte, like, and, or, sql } from "drizzle-orm";
import { books } from "@verso/shared";
import type { SmartFilter, SmartFilterCondition } from "@verso/shared";

function escapeLike(str: string): string {
  return str.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

const columnMap = {
  title: books.title,
  author: books.author,
  publisher: books.publisher,
  series: books.series,
  year: books.year,
  language: books.language,
  fileFormat: books.fileFormat,
  pageCount: books.pageCount,
} as const;

function buildCondition(cond: SmartFilterCondition) {
  const { field, op, value } = cond;

  // Genre requires special handling — stored in book_genres join table, matched by slug
  if (field === "genre") {
    const strVal = String(value);
    switch (op) {
      case "eq":
        return sql`EXISTS (SELECT 1 FROM book_genres bg JOIN genres g ON g.id = bg.genre_id WHERE bg.book_id = ${books.id} AND g.slug = ${strVal})`;
      case "neq":
        return sql`NOT EXISTS (SELECT 1 FROM book_genres bg JOIN genres g ON g.id = bg.genre_id WHERE bg.book_id = ${books.id} AND g.slug = ${strVal})`;
      case "contains":
        return sql`EXISTS (SELECT 1 FROM book_genres bg JOIN genres g ON g.id = bg.genre_id WHERE bg.book_id = ${books.id} AND g.name LIKE ${"%" + strVal + "%"})`;
      case "in":
        if (Array.isArray(value)) {
          const conditions = value.map(
            (v) => sql`EXISTS (SELECT 1 FROM book_genres bg JOIN genres g ON g.id = bg.genre_id WHERE bg.book_id = ${books.id} AND g.slug = ${v})`
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
