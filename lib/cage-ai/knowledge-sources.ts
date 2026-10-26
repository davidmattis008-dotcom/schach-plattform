import rules from "../chess-rules.json" with { type: "json" };
import checkmateTraining from "../checkmate-training.json" with { type: "json" };
import { learningLessons } from "../learning-course.ts";
import { openingRepertoire } from "../opening-repertoire.ts";

export type CageAiKnowledgeDocument = {
  sourceKey: string;
  title: string;
  sourceUrl: string;
  visibility: "authenticated";
  content: string;
};

function text(values: Array<string | undefined>) {
  return values.filter((value): value is string => Boolean(value?.trim())).join("\n\n").trim();
}

export function getCageAiKnowledgeDocuments(): CageAiKnowledgeDocument[] {
  const documents: CageAiKnowledgeDocument[] = [];

  for (const lesson of learningLessons) {
    documents.push({
      sourceKey: `course:lesson:${lesson.id}`,
      title: lesson.title,
      sourceUrl: lesson.practice?.href ?? "/lernen",
      visibility: "authenticated",
      content: text([
        lesson.introduction,
        ...lesson.takeaways,
        lesson.exampleDescription,
        lesson.question,
        lesson.explanation,
      ]),
    });
  }

  for (const rule of rules) {
    documents.push({
      sourceKey: `course:rule:${rule.id}`,
      title: rule.title,
      sourceUrl: "/lernen/regeln",
      visibility: "authenticated",
      content: text([
        rule.description,
        ...rule.facts,
        ...rule.demo.map((example) => example.explanation),
      ]),
    });
  }

  for (const lesson of checkmateTraining) {
    documents.push({
      sourceKey: `course:checkmate:${lesson.id}`,
      title: lesson.title,
      sourceUrl: "/lernen/mattsetzen",
      visibility: "authenticated",
      content: text([
        lesson.material,
        lesson.principle,
        lesson.plan,
        lesson.quiz.question,
        lesson.quiz.explanation,
      ]),
    });
  }

  for (const opening of openingRepertoire) {
    documents.push({
      sourceKey: `course:opening:${opening.id}`,
      title: opening.name,
      sourceUrl: "/repertoire",
      visibility: "authenticated",
      content: text([
        opening.idea,
        ...opening.variants.map((variant) =>
          `${variant.name}: ${variant.description} Zugfolge: ${variant.moves.join(" ")}`,
        ),
      ]),
    });
  }

  return documents;
}
