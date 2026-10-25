import { DailyLearningExercise } from "@/components/daily-learning-exercise";

export default function LearningPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <DailyLearningExercise />
      </div>
    </main>
  );
}
