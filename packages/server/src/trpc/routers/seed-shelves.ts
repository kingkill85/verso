import { shelves } from "@verso/shared";
import type { AppDatabase } from "../../db/client.js";

const DEFAULT_SHELVES = [
  { name: "Currently Reading", emoji: "📖", isSmart: false, isDefault: true, position: 0 },
  { name: "Want to Read", emoji: "🔖", isSmart: false, isDefault: true, position: 1 },
  { name: "Favorites", emoji: "⭐", isSmart: false, isDefault: true, position: 2 },
  {
    name: "Recently Added",
    emoji: "📅",
    isSmart: true,
    isDefault: true,
    position: 3,
    // Special sentinel: evaluated as "books added in last 30 days" in the router,
    // not through the generic filter builder.
    smartFilter: JSON.stringify({
      operator: "AND",
      conditions: [{ field: "_recentlyAdded", op: "lte", value: "30" }],
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
