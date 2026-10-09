"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MiniChessboard } from "@/components/mini-chessboard";
import { learningLessons, learningPaths } from "@/lib/learning-course";

const STORAGE_KEY = "schach-selbstlernen-v1";

const learningOptions = [
  { label: "Lernpfad", detail: "Arbeite dich Schritt für Schritt durch alle Themen.", href: "#lernplan", mark: "↗" },
  { label: "Schachregeln für Anfänger", detail: "Starte ohne Vorwissen mit Brett und Figuren.", href: "#anfang", mark: "♙" },
  { label: "Eröffnungen lernen", detail: "Spiele ausgewählte Varianten Zug für Zug nach.", href: "/repertoire", mark: "⌂" },
  { label: "Mattsetzen lernen", detail: "Übe Mattführungen mit Dame und Turm.", href: "#matt", mark: "♛" },
  { label: "Endspiele für Fortgeschrittene", detail: "Lerne Pläne für Bauern- und Turmendspiele.", href: "#endspiele", mark: "♜" },
];

export function SelfLearningCourse() {
  const [completed, setCompleted] = useState<string[]>([]);
  const [currentLessonId, setCurrentLessonId] = useState(learningLessons[0].id);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [ready, setReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const lessonIndex = learningLessons.findIndex((lesson) => lesson.id === currentLessonId);
  const lesson = learningLessons[lessonIndex] ?? learningLessons[0];
  const nextLesson = learningLessons[lessonIndex + 1];
  const lessonUnlocked = (index: number) => index === 0 || completed.includes(learningLessons[index - 1].id);
  const isCorrect = submitted && selectedAnswer === lesson.correctAnswer;
  const progressPercent = Math.round((completed.length / learningLessons.length) * 100);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      if (Array.isArray(saved)) {
        setCompleted(Array.from(new Set(saved.filter((id): id is string => (
          typeof id === "string" && learningLessons.some((item) => item.id === id)
        )))));
      }
    } catch {
      setStorageAvailable(false);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !storageAvailable) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(completed));
    } catch {
      setStorageAvailable(false);
    }
  }, [completed, ready, storageAvailable]);

  function selectLesson(id: string) {
    setCurrentLessonId(id);
    setSelectedAnswer(null);
    setSubmitted(false);
  }

  function checkAnswer() {
    if (selectedAnswer === null) return;
    setSubmitted(true);
    if (selectedAnswer === lesson.correctAnswer) {
      setCompleted((current) => current.includes(lesson.id) ? current : [...current, lesson.id]);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">Kostenloser Schachkurs</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Selbstständig Schach lernen</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Du brauchst kein Vorwissen und keinen Trainer. Arbeite dich in deinem Tempo von den Regeln bis zu Taktik und Endspielen vor. Jede kurze Lektion endet mit einer Verständnisfrage.
          </p>
        </header>

        <section aria-labelledby="learning-options-heading" className="mb-8">
          <h2 id="learning-options-heading" className="mb-3 text-lg font-semibold text-white">Womit möchtest du lernen?</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {learningOptions.map((option) => (
              <Link
                key={option.href}
                href={option.href}
                className="group rounded-xl border border-slate-800 bg-slate-900/50 p-4 transition hover:border-amber-300/50 hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60"
              >
                <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-300/10 text-lg text-amber-200">{option.mark}</span>
                <span className="mt-3 block text-sm font-semibold text-white group-hover:text-amber-100">{option.label}</span>
                <span className="mt-1 block text-xs leading-5 text-slate-400">{option.detail}</span>
              </Link>
            ))}
          </div>
        </section>

        <section aria-label="Dein Lernfortschritt" className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Dein Lernpfad</h2>
              <p className="mt-1 text-xs text-slate-400">{completed.length} von {learningLessons.length} Lektionen geschafft · wird nur in diesem Browser gespeichert</p>
            </div>
            <span className="text-sm font-semibold tabular-nums text-amber-200">{progressPercent}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-800" role="progressbar" aria-label="Lernfortschritt" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}>
            <div className="h-full rounded-full bg-amber-300 transition-[width]" style={{ width: `${progressPercent}%` }} />
          </div>
          {!storageAvailable && <p role="status" className="mt-3 text-xs text-amber-200">Der Browser kann den Fortschritt gerade nicht speichern. Deine Lektionen bleiben bis zum Schließen dieser Seite auswählbar.</p>}
        </section>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(16rem,0.75fr)_minmax(0,1.5fr)]">
          <nav id="lernplan" aria-label="Lernpfade" className="space-y-3">
            {learningPaths.map((path) => {
              const lessons = path.lessonIds.map((id) => learningLessons.find((item) => item.id === id)!);
              const doneCount = lessons.filter((item) => completed.includes(item.id)).length;
              return (
                <section key={path.id} id={path.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                  <div className="px-2 pb-2">
                    <h2 className="text-sm font-semibold text-white">{path.title}</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{path.description}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{doneCount}/{lessons.length} Lektionen</p>
                  </div>
                  <ol className="space-y-1">
                    {lessons.map((item) => {
                      const index = learningLessons.findIndex((candidate) => candidate.id === item.id);
                      const unlocked = ready && lessonUnlocked(index);
                      const isCurrent = lesson.id === item.id;
                      const isDone = completed.includes(item.id);
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            disabled={!unlocked}
                            aria-current={isCurrent ? "step" : undefined}
                            onClick={() => selectLesson(item.id)}
                            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 ${isCurrent ? "bg-amber-300/10 text-amber-100" : unlocked ? "text-slate-300 hover:bg-slate-800" : "cursor-not-allowed text-slate-600"}`}
                          >
                            <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${isDone ? "border-amber-300/50 text-amber-200" : "border-slate-700"}`}>{isDone ? "✓" : unlocked ? index + 1 : "·"}</span>
                            <span className="min-w-0 flex-1">{item.title}</span>
                            <span className="shrink-0 text-[10px] text-slate-500">{item.minutes} Min.</span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              );
            })}
          </nav>

          <article aria-labelledby="lesson-title" className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 sm:p-7">
            {!ready ? (
              <p role="status" className="text-sm text-slate-400">Dein Lernpfad wird geladen …</p>
            ) : <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-200">Lektion {lessonIndex + 1} · {lesson.minutes} Minuten</p>
                  <h2 id="lesson-title" className="mt-2 text-2xl font-semibold text-white">{lesson.title}</h2>
                </div>
                {completed.includes(lesson.id) && <span className="rounded-full border border-amber-300/30 px-3 py-1 text-xs text-amber-200">Abgeschlossen</span>}
              </div>
              <p className="mt-4 text-sm leading-7 text-slate-300">{lesson.introduction}</p>

              {lesson.exampleFen && lesson.exampleDescription && (
                <figure className="mt-6 grid items-center gap-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4 sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
                  <MiniChessboard fen={lesson.exampleFen} label={`Beispielstellung: ${lesson.title}`} />
                  <figcaption>
                    <p className="text-xs font-semibold uppercase tracking-wider text-amber-200">Beispielstellung</p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{lesson.exampleDescription}</p>
                  </figcaption>
                </figure>
              )}

              <h3 className="mt-6 text-sm font-semibold text-white">Das solltest du mitnehmen</h3>
              <ul className="mt-2 space-y-2">
                {lesson.takeaways.map((takeaway) => <li key={takeaway} className="flex gap-2 text-sm leading-6 text-slate-300"><span aria-hidden="true" className="mt-0.5 text-amber-200">•</span><span>{takeaway}</span></li>)}
              </ul>

              {lesson.practice && <Link href={lesson.practice.href} className="mt-5 inline-flex text-sm font-semibold text-amber-200 underline underline-offset-4 hover:text-amber-100">{lesson.practice.label} →</Link>}

              <section aria-labelledby="lesson-question" className="mt-7 border-t border-slate-800 pt-5">
                <h3 id="lesson-question" className="font-semibold text-white">Prüfe dein Wissen</h3>
                <p className="mt-2 text-sm text-slate-300">{lesson.question}</p>
                <div className="mt-3 space-y-2">
                  {lesson.answers.map((answer, index) => {
                    const isRightAnswer = submitted && index === lesson.correctAnswer;
                    const isWrongSelection = submitted && selectedAnswer === index && !isCorrect;
                    return (
                      <button
                        key={answer}
                        type="button"
                        aria-pressed={selectedAnswer === index}
                        onClick={() => {
                          setSelectedAnswer(index);
                          setSubmitted(false);
                        }}
                        className={`flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 ${isRightAnswer ? "border-amber-300/50 bg-amber-300/10 text-amber-100" : isWrongSelection ? "border-rose-900 bg-rose-950/30 text-rose-100" : selectedAnswer === index ? "border-amber-300/40 bg-amber-300/5 text-white" : "border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-600"}`}
                      >
                        <span aria-hidden="true" className="w-5 shrink-0 text-xs text-slate-500">{String.fromCharCode(65 + index)}.</span>
                        <span>{answer}</span>
                      </button>
                    );
                  })}
                </div>
                {submitted && <p role="status" className={`mt-3 text-sm leading-6 ${isCorrect ? "text-amber-200" : "text-rose-200"}`}>{isCorrect ? `Richtig! ${lesson.explanation}` : `Noch nicht ganz. ${lesson.explanation}`}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  {!completed.includes(lesson.id) && <button type="button" disabled={selectedAnswer === null} onClick={checkAnswer} className="rounded-lg bg-amber-300 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40">Antwort prüfen</button>}
                  {completed.includes(lesson.id) && nextLesson && lessonUnlocked(lessonIndex + 1) && <button type="button" onClick={() => selectLesson(nextLesson.id)} className="rounded-lg bg-amber-300 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-200">Nächste Lektion →</button>}
                  {completed.includes(lesson.id) && !nextLesson && <p className="self-center text-sm font-medium text-amber-200">Geschafft – du hast den Lernpfad abgeschlossen!</p>}
                </div>
              </section>
            </>}
          </article>
        </div>

        <p className="mt-6 text-xs leading-5 text-slate-500">Alle Lektionen und Aufgaben laufen in der Website. Es gibt keine kostenpflichtigen Lerninhalte. Dein Lernfortschritt wird lokal auf diesem Gerät gespeichert und nicht mit einem Konto oder anderen Geräten synchronisiert.</p>
      </div>
    </main>
  );
}
