const OL_BASE = "https://openlibrary.org";
const OL_COVERS = "https://covers.openlibrary.org";

export type AuthorMetadata = {
  description: string | null;
  birthDate: string | null;
  photoUrl: string | null;
};

export async function searchAuthor(name: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({ q: name, limit: "1" });
    const url = `${OL_BASE}/search/authors.json?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.docs?.length) return null;
    return data.docs[0].key;
  } catch {
    return null;
  }
}

export async function fetchAuthorMetadata(olKey: string): Promise<AuthorMetadata | null> {
  try {
    const url = `${OL_BASE}/authors/${olKey}.json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();

    let description: string | null = null;
    if (typeof data.bio === "string") {
      description = data.bio;
    } else if (data.bio?.value) {
      description = data.bio.value;
    }

    const birthDate: string | null = data.birth_date || null;

    let photoUrl: string | null = null;
    if (data.photos?.length > 0) {
      photoUrl = `${OL_COVERS}/a/olid/${olKey}-M.jpg`;
    }

    return { description, birthDate, photoUrl };
  } catch {
    return null;
  }
}
