import Link from "next/link";

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center bg-slate-950 px-5 py-12 text-white">
      <section className="mx-auto w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8">
        <h1 className="text-2xl font-semibold">Registrierung geschlossen</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          ChessCage ist eine private Testumgebung. Testkonten werden vom Betreiber eingerichtet und freigeschaltet.
        </p>
        <Link href="/login" className="mt-6 inline-flex rounded-lg bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950">
          Zum Login
        </Link>
      </section>
    </main>
  );
}
