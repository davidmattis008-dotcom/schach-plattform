import { CageAiPanel } from "@/components/cage-ai-panel";

export default function CoachPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-semibold tracking-tight">Coach</h1>
        <section aria-label="Coach" className="mt-6">
          <CageAiPanel
            contextLabel="CageAI kann einen Trainingsplan aus deinem eigenen Lernfortschritt und deinen Spielstärken vorbereiten."
            contextReady
            contextBadge="Trainingsplan"
            placeholder="Beschreibe, worauf du beim Training achten möchtest …"
            quickPrompts={["Erstelle einen Trainingsplan für meine nächste Woche."]}
            requestConfig={{ purpose: "training_plan" }}
          />
        </section>
      </div>
    </main>
  );
}
