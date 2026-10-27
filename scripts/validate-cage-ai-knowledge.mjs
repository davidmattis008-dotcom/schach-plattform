import assert from "node:assert/strict";
import { getCageAiKnowledgeDocuments } from "../lib/cage-ai/knowledge-sources.ts";
import { createCageAiCourseQuestionRequest } from "../lib/cage-ai/contracts.ts";
import {
  CAGE_AI_KNOWLEDGE_MIN_RANK,
  CAGE_AI_KNOWLEDGE_RESULT_LIMIT,
  buildCageAiKnowledgeQuery,
  normalizeCageAiKnowledgeRows,
  resolveCageAiKnowledgeCitations,
} from "../lib/cage-ai/knowledge-search.ts";

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
assert.ok(documents.every((document) =>
  ["course:lesson:", "course:rule:", "course:checkmate:", "course:opening:"]
    .some((prefix) => document.sourceKey.startsWith(prefix)),
), "Only repository-owned learning sources may enter the reviewed corpus.");

const courseLesson = documents.find((document) => document.sourceKey === "course:lesson:taktikmotive");
assert.ok(courseLesson?.content.includes("Gabel"));
assert.ok(courseLesson?.content.includes("Fesselung"));
const opening = documents.find((document) => document.sourceKey === "course:opening:london");
assert.equal(opening?.title, "Londoner System");
assert.ok(opening?.sourceUrl === "/repertoire");

const request = createCageAiCourseQuestionRequest(
  "Wie funktioniert eine Gabel?",
  {
    courseId: "tactics",
    lessonTitle: "Gabel, Fesselung und Spieß",
    sourceKeys: ["course:lesson:taktikmotive"],
  },
);
assert.match(buildCageAiKnowledgeQuery(request), /Gabel, Fesselung und Spieß/);
assert.match(buildCageAiKnowledgeQuery(request), /Wie funktioniert eine Gabel/);
const normalizedRows = normalizeCageAiKnowledgeRows([
  {
    source_key: "course:lesson:taktikmotive",
    title: "Gabel, Fesselung und Spieß",
    source_url: "/lernen",
    heading: "Gabel, Fesselung und Spieß",
    content: courseLesson.content,
    rank: CAGE_AI_KNOWLEDGE_MIN_RANK,
  },
  {
    source_key: "course:rule:queen",
    title: "Dame",
    source_url: "/lernen/regeln",
    heading: "Dame",
    content: "Die Dame zieht gerade und diagonal.",
    rank: CAGE_AI_KNOWLEDGE_MIN_RANK / 10,
  },
  ...Array.from({ length: CAGE_AI_KNOWLEDGE_RESULT_LIMIT }, (_, index) => ({
    source_key: `course:rule:topic-${index}`,
    title: `Regel ${index}`,
    source_url: "/lernen/regeln",
    heading: `Regel ${index}`,
    content: "Prüfbarer Regeltext.",
    rank: 0.5,
  })),
]);
assert.equal(normalizedRows.length, CAGE_AI_KNOWLEDGE_RESULT_LIMIT);
assert.equal(normalizedRows[0].sourceKey, "course:lesson:taktikmotive");
assert.equal(normalizedRows.some((row) => row.sourceKey === "course:rule:queen"), false);
assert.equal(normalizedRows[0].chunkId, "course:lesson:taktikmotive:0");
assert.deepEqual(
  resolveCageAiKnowledgeCitations([normalizedRows[0].chunkId], normalizedRows),
  [{
    title: "Gabel, Fesselung und Spieß",
    url: "/lernen",
    heading: "Gabel, Fesselung und Spieß",
  }],
);
assert.equal(
  resolveCageAiKnowledgeCitations(["course:lesson:unretrieved:0"], normalizedRows),
  null,
  "A model must not cite a source that retrieval did not return.",
);
assert.throws(() => normalizeCageAiKnowledgeRows([{
  source_key: "course:lesson:taktikmotive",
  title: "Gabel",
  source_url: "//example.invalid",
  heading: "Gabel",
  content: "Untrusted external content.",
  rank: 0.9,
}]), /ungültiges Ergebnis/);

console.log(`Validated ${documents.length} authenticated ChessCage knowledge sources.`);
