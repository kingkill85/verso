import { eq, and, like } from "drizzle-orm";
import { shelves } from "@verso/shared";
import type { AppDatabase } from "../../db/client.js";

const DEFAULT_SHELVES = [
  {
    name: "Currently Reading",
    emoji: "icon:book-open",
    isSmart: true,
    isDefault: true,
    position: 0,
    smartFilter: JSON.stringify({
      operator: "AND",
      conditions: [{ field: "_currentlyReading", op: "eq", value: "true" }],
    }),
  },
  { name: "Want to Read", emoji: "icon:bookmark-plus", isSmart: false, isDefault: true, position: 1 },
  { name: "Favorites", emoji: "icon:star", isSmart: false, isDefault: true, position: 2 },
  {
    name: "Recently Added",
    emoji: "icon:clock",
    isSmart: true,
    isDefault: true,
    position: 3,
    smartFilter: JSON.stringify({
      operator: "AND",
      conditions: [{ field: "_recentlyAdded", op: "lte", value: "30" }],
    }),
  },
  {
    name: "Finished",
    emoji: "icon:check-circle",
    isSmart: true,
    isDefault: true,
    position: 4,
    smartFilter: JSON.stringify({
      operator: "AND",
      conditions: [{ field: "_finished", op: "eq", value: "true" }],
    }),
  },
];

export async function seedDefaultShelves(db: AppDatabase, userId: string) {
  for (const shelf of DEFAULT_SHELVES) {
    await db.insert(shelves).values({
      ...shelf,
      userId,
    });
  }
}

/** Backfill any missing default shelves for an existing user */
export async function backfillDefaultShelves(db: AppDatabase, userId: string) {
  const existing = await db
    .select({ name: shelves.name })
    .from(shelves)
    .where(and(eq(shelves.userId, userId), eq(shelves.isDefault, true)));

  const existingNames = new Set(existing.map((s) => s.name));

  for (const shelf of DEFAULT_SHELVES) {
    if (!existingNames.has(shelf.name)) {
      await db.insert(shelves).values({ ...shelf, userId });
    }
  }

}
