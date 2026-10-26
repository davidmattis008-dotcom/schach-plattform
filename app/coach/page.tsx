import { CageAiTrainingPlanManager } from "@/components/cage-ai-training-plan";

export default function CoachPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-semibold tracking-tight">Coach</h1>
        <CageAiTrainingPlanManager />
      </div>
    </main>
  );
}
