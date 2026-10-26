import assert from "node:assert/strict";
import { getCageAiKnowledgeDocuments } from "../lib/cage-ai/knowledge-sources.ts";

const documents = getCageAiKnowledgeDocuments();
const sourceKeys = documents.map((document) => document.sourceKey);

assert.ok(documents.length >= 20, "The repository's course corpus should be indexed.");
assert.equal(new Set(sourceKeys).size, sourceKeys.length, "Knowledge source keys must be unique.");
assert.ok(documents.every((document) =>
  document.visibility === "authenticated"
    && document.title.trim().length > 0
    && document.content.trim().length > 0
    && document.sourceUrl.startsWith("/")
    && !document.sourceUrl.startsWith("//")
));
assert.ok(documents.every((document) =>
  !/[prnbqkPRNBQK1-8]{1,8}(?:\/[prnbqkPRNBQK1-8]{1,8}){7}\s[wb]\b/.test(document.content)
));
assert.ok(!documents.find((document) => document.sourceKey === "course:checkmate:fools-mate")?.content.includes("d8h4"));

const courseLesson = documents.find((document) => document.sourceKey === "course:lesson:taktikmotive");
assert.ok(courseLesson?.content.includes("Gabel"));
assert.ok(courseLesson?.content.includes("Fesselung"));
const opening = documents.find((document) => document.sourceKey === "course:opening:london");
assert.equal(opening?.title, "Londoner System");
assert.ok(opening?.sourceUrl === "/repertoire");

console.log(`Validated ${documents.length} authenticated ChessCage knowledge sources.`);
