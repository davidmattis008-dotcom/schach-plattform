"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  MAX_SCORE_SHEET_FILE_BYTES,
  MAX_SCORE_SHEET_PAGES,
  recognizeScoreSheetPages,
  type ScoreSheetPageInput,
  type PreparedScoreSheetRow,
} from "@/lib/chess/score-sheet-image";
import {
  formatMoveLabel,
  getScoreSheetIssueMessage,
  reviewScoreSheet,
} from "@/lib/chess/score-sheet-review";

type Props = {
  onLoadPgn: (pgn: string) => void;
};

function confidenceLabel(confidence: number) {
  return `${Math.round(confidence * 100)}%`;
}

export function ChessScoreSheetImporter({ onLoadPgn }: Props) {
  const [pages, setPages] = useState<ScoreSheetPageInput[]>([]);
  const [rows, setRows] = useState<PreparedScoreSheetRow[]>([]);
  const [corrections, setCorrections] = useState<Record<number, string>>({});
  const [correctionPly, setCorrectionPly] = useState<number | null>(null);
  const [correctionText, setCorrectionText] = useState("");
  const [correctionError, setCorrectionError] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const review = useMemo(() => reviewScoreSheet(rows.map((row) => ({
    ...row,
    hypotheses: row.hypotheses.map((text) => ({ text })),
  })), corrections), [rows, corrections]);

  useEffect(() => () => {
    rows.forEach((row) => URL.revokeObjectURL(row.cropUrl));
  }, [rows]);

  function selectFiles(files: FileList | null) {
    setError("");
    setStatus("");
    setRows([]);
    setCorrections({});
    setReviewed(false);
    const selected = Array.from(files ?? []);
    if (selected.length === 0) {
      setPages([]);
      return;
    }
    if (selected.length > MAX_SCORE_SHEET_PAGES) {
      setPages([]);
      setError(`Du kannst höchstens ${MAX_SCORE_SHEET_PAGES} Formularseiten gleichzeitig auswählen.`);
      return;
    }
    if (selected.some((file) =>
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
      || file.size > MAX_SCORE_SHEET_FILE_BYTES
    )) {
      setPages([]);
      setError("Erlaubt sind JPG-, PNG- oder WebP-Bilder mit höchstens 12 MB pro Seite.");
      return;
    }
    setPages(selected.map((file, index) => ({ file, page: index + 1, rotation: 0 })));
  }

  function rotatePage(pageNumber: number, direction: -90 | 90) {
    setPages((current) => current.map((page) => page.page === pageNumber
      ? { ...page, rotation: ((page.rotation + direction + 360) % 360) as ScoreSheetPageInput["rotation"] }
      : page));
  }

  async function recognize() {
    if (pages.length === 0 || busy) return;
    setBusy(true);
    setError("");
    setStatus("Das lokale OpenCV-Modul wird vorbereitet …");
    setRows([]);
    setCorrections({});
    setReviewed(false);
    try {
      const { createLocalScoreSheetOcrProvider } = await import("@/lib/chess/score-sheet-ocr");
      const provider = createLocalScoreSheetOcrProvider();
      const recognized = await recognizeScoreSheetPages(pages, provider, (page, total) => {
        setStatus(`Formularseite ${page} von ${total} wird lokal gelesen …`);
      });
      if (recognized.length === 0) {
        recognized.forEach((row) => URL.revokeObjectURL(row.cropUrl));
        throw new Error("Auf den ausgewählten Seiten wurden keine beschreibbaren Zeilen gefunden.");
      }
      setRows(recognized);
      setStatus("Erkennung abgeschlossen. Bitte prüfe die Ausschnitte und die Züge.");
    } catch (recognitionError) {
      console.error("Das Schachformular konnte nicht erkannt werden:", recognitionError);
      setError(recognitionError instanceof Error
        ? recognitionError.message
        : "Das Schachformular konnte nicht gelesen werden.");
    } finally {
      setBusy(false);
      setPages([]);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function startCorrection(ply: number, value = "") {
    setCorrectionPly(ply);
    setCorrectionText(value);
    setCorrectionError("");
  }

  function saveCorrection() {
    if (correctionPly === null) return;
    if (!correctionText.trim()) {
      setCorrectionError("Gib einen Zug ein, zum Beispiel e4, Sf3 oder Nf3.");
      return;
    }
    setCorrections((current) => ({ ...current, [correctionPly]: correctionText.trim() }));
    setCorrectionPly(null);
    setCorrectionText("");
    setCorrectionError("");
    setReviewed(false);
  }

  function importPgn(pgn: string) {
    if (!pgn.trim()) return;
    onLoadPgn(pgn);
    setRows([]);
    setCorrections({});
    setReviewed(false);
    setStatus("Die rekonstruierte Partie wurde in die Analyse geladen. Starte dort die Stockfish-Partieanalyse.");
  }

  const issueRow = review.issue
    ? rows.find((row) => row.page === review.issue?.page && row.row === review.issue?.row)
    : undefined;
  const canLoadFullGame = review.issue === null && review.moves.length > 0 && reviewed;

  return (
    <section className="rounded-xl border border-emerald-400/20 bg-slate-900 p-3 sm:p-4">
      <h2 className="font-bold">Handschriftliches Schachformular</h2>
      <p className="mt-1 text-xs leading-5 text-slate-400">
        Bilder bleiben auf diesem Gerät und werden nach dem Lesen aus der Seite entfernt. Das Open-Source-Modell wird einmalig von Hugging Face geladen (etwa 64 MB); nur Modell-Dateien, keine Fotos, werden aus dem Internet bezogen.
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        Durchgestrichene oder fehlende Züge werden nicht erraten. Move-Nummern helfen, Lücken zu erkennen; bei unklarer Handschrift musst du den Zug im Ausschnitt bestätigen oder ergänzen.
      </p>
      <label className="mt-3 inline-flex cursor-pointer rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800">
        Fotos/Scans auswählen
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(event) => selectFiles(event.target.files)}
          className="sr-only"
          aria-label="Mehrseitiges handschriftliches Schachformular auswählen"
        />
      </label>
      {pages.length > 0 && <div className="mt-3 space-y-2">
        <p className="text-xs text-slate-400">{pages.length} Seite(n) ausgewählt · Modell: Xenova/trocr-small-handwritten</p>
        {pages.map((page) => (
          <div key={`${page.page}-${page.file.name}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950 p-2">
            <span className="min-w-0 truncate text-sm text-slate-200">Seite {page.page}: {page.file.name} · Drehung {page.rotation}°</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => rotatePage(page.page, -90)} disabled={busy} className="rounded border border-slate-700 px-2 py-1 text-xs">↶ 90°</button>
              <button type="button" onClick={() => rotatePage(page.page, 90)} disabled={busy} className="rounded border border-slate-700 px-2 py-1 text-xs">↷ 90°</button>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => void recognize()} disabled={busy} className="w-full rounded-lg bg-emerald-400 px-3 py-2.5 font-semibold text-slate-950 disabled:opacity-50">
          {busy ? "Lese lokal …" : "Formularseiten erkennen"}
        </button>
      </div>}
      {busy && <p role="status" className="mt-2 text-sm text-slate-300">{status}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-amber-200">{error}</p>}
      {!busy && status && <p role="status" className="mt-2 text-sm text-slate-300">{status}</p>}

      {rows.length > 0 && <>
        <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950 p-3">
          <h3 className="font-semibold">Zugprüfung</h3>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Jede Zugfolge wird von der Startstellung an mit Schachregeln geprüft. Confidence ist die Übereinstimmung verfügbarer Modellvorschläge, keine kalibrierte Wahrscheinlichkeit. Bei nur einem Vorschlag, Widerspruch oder illegalem Zug wird nicht automatisch übernommen; die Folgeprüfung stoppt.
          </p>
          <p className="mt-2 text-sm text-slate-200">
            Sicher geprüft: {review.moves.length} Halbzüge{review.issue ? ` · Klärung bei ${formatMoveLabel(review.issue.ply)}` : " · keine offenen Mehrdeutigkeiten"}.
          </p>
        </div>

        {review.issue && <div className="mt-3 rounded-lg border border-amber-300/40 bg-amber-400/5 p-3" role="alert">
          <h3 className="font-semibold text-amber-100">CageAI: Ich bin mir bei Zug {formatMoveLabel(review.issue.ply)} nicht sicher. {getScoreSheetIssueMessage(review.issue)}</h3>
          {issueRow && <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <p className="mb-1 text-xs text-slate-400">Ausschnitt · Seite {issueRow.page}, Zeile {issueRow.row}</p>
              <Image src={issueRow.cropUrl} unoptimized width={560} height={112} alt={`Formularausschnitt Seite ${issueRow.page}, Zeile ${issueRow.row}`} className="max-h-28 max-w-full rounded border border-slate-700 bg-white object-contain" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Erkannte Lesarten</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {review.issue.candidates.map((candidate, index) => (
                  <button key={`${candidate}-${index}`} type="button" onClick={() => startCorrection(review.issue!.ply, candidate)} className="rounded border border-amber-300/40 px-2 py-1 font-mono text-sm text-amber-100 hover:bg-amber-300/10">{candidate}</button>
                ))}
                <button type="button" onClick={() => startCorrection(review.issue!.ply)} className="rounded border border-slate-700 px-2 py-1 text-sm text-slate-200 hover:bg-slate-800">Anderen Zug eingeben</button>
              </div>
              {review.issue.candidates.length > 0 && <p className="mt-2 text-xs text-slate-400">Übereinstimmung: {confidenceLabel(review.issue.confidence)} · Alternativen sind ungeprüfte OCR-Vorschläge.</p>}
            </div>
          </div>}
          {correctionPly === review.issue.ply && <div className="mt-3 flex flex-wrap gap-2">
            <label htmlFor="score-sheet-correction" className="sr-only">Zug {formatMoveLabel(correctionPly)} korrigieren</label>
            <input id="score-sheet-correction" autoFocus value={correctionText} onChange={(event) => setCorrectionText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveCorrection(); }} placeholder="Zug, z. B. Bf5, Be5 oder e4" className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white" />
            <button type="button" onClick={saveCorrection} className="rounded bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950">Zug übernehmen</button>
            <button type="button" onClick={() => setCorrectionPly(null)} className="rounded border border-slate-700 px-3 py-2 text-sm">Abbrechen</button>
          </div>}
          {correctionError && <p role="alert" className="mt-2 text-xs text-amber-200">{correctionError}</p>}
          <p className="mt-3 text-xs leading-5 text-slate-400">
            Wenn ein Zug im Formular wirklich fehlt, sind spätere Stellungen ohne diesen Zug nicht verifizierbar. Du kannst den sicheren Partiebeginn bis vor der Lücke laden oder den Zug ergänzen.
          </p>
        </div>}

        <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
          {rows.map((row) => (
            <div key={row.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-lg border border-slate-800 bg-slate-950 p-2">
              <Image src={row.cropUrl} unoptimized width={224} height={56} alt={`Seite ${row.page}, Zeile ${row.row}`} className="max-h-14 max-w-28 rounded border border-slate-800 bg-white object-contain" />
              <div className="min-w-0">
                <p className="text-xs text-slate-500">Seite {row.page} · Zeile {row.row}</p>
                <p className="break-words font-mono text-xs text-slate-200">{row.hypotheses[0] || "Keine Lesart erkannt"}</p>
                {row.hypotheses.length > 1 && <p className="break-words text-xs text-slate-500">Weitere: {row.hypotheses.slice(1).join(" · ")}</p>}
              </div>
            </div>
          ))}
        </div>

        {review.moves.length > 0 && <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-3">
          <h3 className="font-semibold">Validierte Züge</h3>
          <div className="mt-2 flex max-h-36 flex-wrap gap-2 overflow-y-auto">
            {review.moves.map((move) => (
              <button key={move.ply} type="button" onClick={() => startCorrection(move.ply, move.san)} title={`Übereinstimmung ${confidenceLabel(move.confidence)}${move.corrected ? " · manuell korrigiert" : ""}`} className={`rounded px-2 py-1 text-sm ${move.corrected ? "bg-sky-500/20 text-sky-200" : "bg-slate-800 text-slate-200"}`}>
                {formatMoveLabel(move.ply)} {move.san} <span className="text-xs opacity-70">{move.corrected ? "korrigiert" : confidenceLabel(move.confidence)}</span>
              </button>
            ))}
          </div>
          {correctionPly !== null && !review.issue && <div className="mt-3 flex flex-wrap gap-2">
            <label htmlFor="score-sheet-correction" className="sr-only">Zug {formatMoveLabel(correctionPly)} korrigieren</label>
            <input id="score-sheet-correction" autoFocus value={correctionText} onChange={(event) => setCorrectionText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveCorrection(); }} className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-white" />
            <button type="button" onClick={saveCorrection} className="rounded bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950">Korrektur übernehmen</button>
          </div>}
          {correctionError && <p role="alert" className="mt-2 text-xs text-amber-200">{correctionError}</p>}
          <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-300">
            <input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} className="mt-1 accent-emerald-400" />
            Ich habe die Formularausschnitte geprüft und bestätige die erkannten Züge.
          </label>
          {review.issue && review.moves.length > 0 && <button type="button" onClick={() => importPgn(review.pgn)} className="mt-3 w-full rounded-lg border border-amber-300/40 px-3 py-2.5 text-sm font-semibold text-amber-100 hover:bg-amber-300/10">
            Nur sicheren Partiebeginn bis vor der Lücke in die Analyse laden
          </button>}
          {!review.issue && <button type="button" onClick={() => importPgn(review.pgn)} disabled={!canLoadFullGame} className="mt-3 w-full rounded-lg bg-emerald-400 px-3 py-2.5 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">
            Bestätigte Partie in die Analyse laden
          </button>}
        </div>}
      </>}
    </section>
  );
}
