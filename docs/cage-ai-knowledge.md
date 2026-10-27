# ChessCageAI knowledge base

ChessCageAI knowledge retrieval is kept separate from the language-model provider:

1. `lib/cage-ai/knowledge-sources.ts` builds the first-party corpus from ChessCage lessons, chess rules, checkmate training, and the curated opening repertoire.
2. `scripts/sync-cage-ai-knowledge.mjs` chunks and hashes those documents, then synchronizes them to Supabase. Run `npm run sync:cage-ai-knowledge -- --dry-run` to validate the payload without credentials.
3. `public.search_cage_ai_knowledge` in the Supabase migration performs authenticated PostgreSQL full-text search. `lib/cage-ai/knowledge-retrieval.ts` adapts its results to the model-independent `CageAiKnowledgeChunk` format.
4. The explanation route passes retrieved chunks to the configured provider and accepts citations only for chunks returned by that search. Course answers without a matching source are declined rather than generated from unsupported model knowledge.

The current corpus is small and consists only of repository-owned content. PostgreSQL full-text search is sufficient for it and avoids an embedding provider, extra cost, and model-specific vector data. The retrieval contract can later be implemented by a different PostgreSQL search backend or a vector index without coupling that choice to the language model.

## Adding knowledge

- Add only ChessCage-owned content or content whose license and use have been explicitly reviewed. Do not index uploads, conversations, external pages, or licensed text by default.
- Give each source a stable `course:` key and an internal ChessCage URL. Keep answers, exercises, and solution-only data out of chunks unless they are meant to be exposed as learning material.
- Check the source text and its examples before adding it. Where a source contains chess positions or move sequences, validate them with `chess.js` and extend the corresponding source-validation test.
- Run `npm run test:cage-ai-knowledge`, the relevant course validators, and `npm run sync:cage-ai-knowledge -- --dry-run`.
- Apply the Supabase migration before the first live sync. The sync command requires `SUPABASE_SERVICE_ROLE_KEY`; never expose that key to the browser or commit it.

Embeddings should be considered only when the curated corpus or measured search quality makes keyword retrieval inadequate. If introduced, use an explicitly selected embedding model and keep vectors, ranking, and provider credentials behind the retrieval adapter.
