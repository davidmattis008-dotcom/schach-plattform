import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { getCageAiKnowledgeDocuments } from "../lib/cage-ai/knowledge-sources.ts";

const MAX_CHUNK_LENGTH = 2_400;

function splitLongText(value) {
  const pieces = [];
  let current = "";
  for (const word of value.split(/\s+/)) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > MAX_CHUNK_LENGTH && current) {
      pieces.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

function splitIntoChunks(value) {
  const chunks = [];
  let current = "";
  for (const paragraph of value.split(/\n+/).map((part) => part.trim()).filter(Boolean)) {
    for (const piece of splitLongText(paragraph)) {
      const next = current ? `${current}\n\n${piece}` : piece;
      if (next.length > MAX_CHUNK_LENGTH && current) {
        chunks.push(current);
        current = piece;
      } else {
        current = next;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function prepareSources(documents) {
  return documents.map((document) => {
    const chunks = splitIntoChunks(document.content).map((content) => ({
      heading: document.title,
      content,
    }));
    assert.ok(chunks.length > 0, `Leerer Wissensartikel: ${document.sourceKey}`);
    return {
      sourceKey: document.sourceKey,
      title: document.title,
      sourceUrl: document.sourceUrl,
      visibility: document.visibility,
      contentHash: createHash("sha256").update(document.content).digest("hex"),
      chunks,
    };
  });
}

const sources = prepareSources(getCageAiKnowledgeDocuments());
assert.equal(new Set(sources.map((source) => source.sourceKey)).size, sources.length);
assert.ok(sources.every((source) => source.chunks.every((chunk) => chunk.content.length <= MAX_CHUNK_LENGTH)));

if (process.argv.includes("--dry-run")) {
  console.log(`Validiert: ${sources.length} Wissensquellen, ${sources.reduce((sum, source) => sum + source.chunks.length, 0)} Chunks.`);
  process.exit(0);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen für den Wissens-Sync gesetzt sein.");
}

const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/sync_cage_ai_knowledge`, {
  method: "POST",
  headers: {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ p_sources: sources }),
});
if (!response.ok) {
  const details = await response.text();
  throw new Error(`Wissens-Sync fehlgeschlagen (${response.status}): ${details}`);
}

const result = await response.json();
console.log(`Wissens-Sync abgeschlossen: ${result.updated} aktualisiert, ${result.unchanged} unverändert.`);
