import type { FastifyInstance } from "fastify";
import { createBasicAuthHook } from "../middleware/basic-auth.js";
import {
  buildRootFeed,
  buildAllBooks,
  buildRecentBooks,
  buildAuthorsList,
  buildAuthorBooks,
  buildGenresList,
  buildGenreBooks,
  buildShelvesList,
  buildShelfBooks,
  buildSearchResults,
  serializeFeed,
} from "../services/opds-server.js";
import type { AppDatabase } from "../db/client.js";
import type { Config } from "../config.js";

const ATOM_NAV = "application/atom+xml;profile=opds-catalog;kind=navigation";
const ATOM_ACQ = "application/atom+xml;profile=opds-catalog;kind=acquisition";
const OPENSEARCH_TYPE = "application/opensearchdescription+xml";

const OPENSEARCH_DESCRIPTOR = `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>Verso</ShortName>
  <Description>Search your Verso library</Description>
  <Url type="application/atom+xml;profile=opds-catalog;kind=acquisition"
       template="/opds/search?q={searchTerms}"/>
</OpenSearchDescription>`;

export function registerOpdsRoutes(app: FastifyInstance, db: AppDatabase, _config: Config) {
  const authHook = createBasicAuthHook(db);

  // GET /opds/search-descriptor — OpenSearch descriptor (no auth)
  app.get("/opds/search-descriptor", async (_req, reply) => {
    return reply.header("Content-Type", OPENSEARCH_TYPE).send(OPENSEARCH_DESCRIPTOR);
  });

  // GET /opds/catalog — root navigation feed
  app.get("/opds/catalog", { preHandler: authHook }, async (req, reply) => {
    const feed = await buildRootFeed(db, req.user!.sub);
    return reply.header("Content-Type", ATOM_NAV).send(serializeFeed(feed));
  });

  // GET /opds/all — all books (paginated)
  app.get<{ Querystring: { page?: string } }>(
    "/opds/all",
    { preHandler: authHook },
    async (req, reply) => {
      const page = Math.max(1, parseInt(req.query.page ?? "1", 10) || 1);
      const feed = await buildAllBooks(db, req.user!.sub, page);
      return reply.header("Content-Type", ATOM_ACQ).send(serializeFeed(feed));
    }
  );

  // GET /opds/recent — recently added
  app.get<{ Querystring: { page?: string } }>(
    "/opds/recent",
    { preHandler: authHook },
    async (req, reply) => {
      const page = Math.max(1, parseInt(req.query.page ?? "1", 10) || 1);
      const feed = await buildRecentBooks(db, req.user!.sub, page);
      return reply.header("Content-Type", ATOM_ACQ).send(serializeFeed(feed));
    }
  );

  // GET /opds/authors — authors list (navigation)
  app.get("/opds/authors", { preHandler: authHook }, async (req, reply) => {
    const feed = await buildAuthorsList(db, req.user!.sub);
    return reply.header("Content-Type", ATOM_NAV).send(serializeFeed(feed));
  });

  // GET /opds/authors/:name — books by author
  app.get<{ Params: { name: string }; Querystring: { page?: string } }>(
    "/opds/authors/:name",
    { preHandler: authHook },
    async (req, reply) => {
      const author = decodeURIComponent(req.params.name);
      const page = Math.max(1, parseInt(req.query.page ?? "1", 10) || 1);
      const feed = await buildAuthorBooks(db, req.user!.sub, author, page);
      return reply.header("Content-Type", ATOM_ACQ).send(serializeFeed(feed));
    }
  );

  // GET /opds/genres — genres list (navigation)
  app.get("/opds/genres", { preHandler: authHook }, async (req, reply) => {
    const feed = await buildGenresList(db, req.user!.sub);
    return reply.header("Content-Type", ATOM_NAV).send(serializeFeed(feed));
  });

  // GET /opds/genres/:genre — books by genre
  app.get<{ Params: { genre: string }; Querystring: { page?: string } }>(
    "/opds/genres/:genre",
    { preHandler: authHook },
    async (req, reply) => {
      const genre = decodeURIComponent(req.params.genre);
      const page = Math.max(1, parseInt(req.query.page ?? "1", 10) || 1);
      const feed = await buildGenreBooks(db, req.user!.sub, genre, page);
      return reply.header("Content-Type", ATOM_ACQ).send(serializeFeed(feed));
    }
  );

  // GET /opds/shelves — shelves list (navigation)
  app.get("/opds/shelves", { preHandler: authHook }, async (req, reply) => {
    const feed = await buildShelvesList(db, req.user!.sub);
    return reply.header("Content-Type", ATOM_NAV).send(serializeFeed(feed));
  });

  // GET /opds/shelves/:id — books on shelf
  app.get<{ Params: { id: string }; Querystring: { page?: string } }>(
    "/opds/shelves/:id",
    { preHandler: authHook },
    async (req, reply) => {
      const page = Math.max(1, parseInt(req.query.page ?? "1", 10) || 1);
      const feed = await buildShelfBooks(db, req.user!.sub, req.params.id, page);
      return reply.header("Content-Type", ATOM_ACQ).send(serializeFeed(feed));
    }
  );

  // GET /opds/search?q= — search (empty q returns all books)
  app.get<{ Querystring: { q?: string; page?: string } }>(
    "/opds/search",
    { preHandler: authHook },
    async (req, reply) => {
      const query = req.query.q ?? "";
      const page = Math.max(1, parseInt(req.query.page ?? "1", 10) || 1);
      const feed = await buildSearchResults(db, req.user!.sub, query, page);
      return reply.header("Content-Type", ATOM_ACQ).send(serializeFeed(feed));
    }
  );
}
