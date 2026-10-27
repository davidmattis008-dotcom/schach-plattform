import type {
  CageAiExplanationRequest,
  CageAiGameDetails,
  CageAiMoveEvidence,
} from "./contracts.ts";
import type { CageAiPersonalContext } from "./context-selection.ts";
import type { MoveQuality } from "../chess/stockfish-analysis.ts";

const QUALITY_LABELS: Record<MoveQuality, string> = {
  good: "gut",
  inaccuracy: "Ungenauigkeit",
  mistake: "Fehler",
  blunder: "schwerer Fehler",
};

const GAME_RESULTS: Record<NonNullable<CageAiGameDetails["result"]>, string> = {
  "1-0": "Weiß gewann",
  "0-1": "Schwarz gewann",
  "1/2-1/2": "Remis",
  "*": "Ergebnis offen oder nicht angegeben",
};

const RATING_MODES: Record<string, string> = {
  bullet: "Bullet",
  blitz: "Blitz",
  rapid: "Rapid",
  classical: "Klassisch",
};

function moveLabel(move: CageAiMoveEvidence) {
  return `${Math.ceil(move.ply / 2)}${move.color === "w" ? "." : "…"} ${move.playedMove}`;
}

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatGameDetails(details: CageAiGameDetails | undefined) {
  if (!details) return [];
  const players = [details.white, details.black].some(Boolean)
    ? `Spieler: ${details.white ?? "Weiß"} – ${details.black ?? "Schwarz"}.`
    : "";
  const ratings = [
    details.whiteElo === undefined ? "" : `${details.white ?? "Weiß"} ${details.whiteElo} Elo`,
    details.blackElo === undefined ? "" : `${details.black ?? "Schwarz"} ${details.blackElo} Elo`,
  ].filter(Boolean);
  return [
    players,
    ratings.length ? `PGN-Elo: ${ratings.join(", ")}.` : "",
    details.result ? `Ergebnis laut PGN: ${GAME_RESULTS[details.result]}.` : "",
  ].filter(Boolean);
}

function formatPersonalContext(context: CageAiPersonalContext) {
  const details: string[] = [];
  if (context.ratings?.length) {
    details.push(`Deine gespeicherten Wertungen: ${context.ratings
      .map((rating) => `${RATING_MODES[rating.game_mode] ?? rating.game_mode} ${rating.rating} Elo`)
      .join(", ")}.`);
  }
  const tactics = context.learning?.tactics;
  if (tactics && tactics.attempted > 0) {
    details.push(`Trainingsfortschritt: ${tactics.solved} von ${tactics.attempted} Taktikaufgaben gelöst; Taktik-Elo ${tactics.rating}.`);
  }
  const weakness = context.memories?.find((memory) => memory.memoryType === "weakness");
  if (weakness) {
    details.push(`Gespeicherter Trainingsschwerpunkt: ${weakness.content}`);
  }
  return details;
}

function formatMoveFinding(move: CageAiMoveEvidence) {
  const color = move.color === "w" ? "Weiß" : "Schwarz";
  const line = move.bestVariation.length
    ? ` Stockfish-Hauptvariante: ${move.bestVariation.join(" ")}.`
    : "";
  const bestMove = move.bestMove
    ? ` Die Engine bevorzugte ${move.bestMove}.`
    : " Für diesen Moment liegt kein Engine-Bestzug vor.";
  return [
    `Halbzug ${move.ply} (${color}: ${moveLabel(move)}): Stockfish stuft den Zug als ${QUALITY_LABELS[move.quality]} ein.`,
    `Der berechnete Bewertungsverlust gegenüber der besten Wahl beträgt ${move.centipawnLoss} Centipawn.${bestMove}${line}`,
    "Die gelieferten Engine-Daten belegen den Bewertungsunterschied und die angezeigte Variante, aber kein konkretes taktisches Motiv. Ich erfinde deshalb keine weitere Begründung oder Folgezüge.",
  ];
}

export function createLocalGameReviewExplanation(
  request: CageAiExplanationRequest,
  personalContext: CageAiPersonalContext,
) {
  if (request.purpose !== "game_review" || request.analysis?.kind !== "game") {
    throw new Error("Die lokale Erklärung benötigt eine vollständige Partieanalyse.");
  }

  const { analysis } = request;
  const playerEvidence = analysis.game?.playerColor
    ? analysis.evidence.filter((move) => move.color === analysis.game?.playerColor)
    : analysis.evidence;
  const allEvidence = analysis.evidence;
  const findings = playerEvidence.length ? playerEvidence : allEvidence;
  const strongestMove = findings.reduce<CageAiMoveEvidence | null>(
    (strongest, move) => !strongest || move.centipawnLoss > strongest.centipawnLoss ? move : strongest,
    null,
  );
  const player = analysis.game?.playerColor === "w"
    ? analysis.game.white ?? "Weiß"
    : analysis.game?.playerColor === "b"
      ? analysis.game.black ?? "Schwarz"
      : null;
  const counts = analysis.qualityCounts;
  const summary = [
    `Stockfish hat ${analysis.analyzedPlies} Halbzüge dieser Partie analysiert. Erfasst wurden ${countLabel(counts.inaccuracy, "Ungenauigkeit", "Ungenauigkeiten")}, ${countLabel(counts.mistake, "Fehler", "Fehler")} und ${countLabel(counts.blunder, "schwerer Fehler", "schwere Fehler")}.`,
    ...formatGameDetails(analysis.game),
    ...(player ? [`Deine Farbe: ${player} (${analysis.game?.playerColor === "w" ? "Weiß" : "Schwarz"}).`] : []),
    ...formatPersonalContext(personalContext),
  ];

  if (strongestMove) {
    const findingScope = playerEvidence.length && player
      ? `von ${player}`
      : analysis.game?.playerColor
        ? "der Partie (für deine Farbe wurde kein auffälliger Zug übermittelt)"
        : "der Partie";
    summary.push(
      `Größter analysierter Bewertungsverlust ${findingScope}:`,
      ...formatMoveFinding(strongestMove),
      strongestMove.bestMove
        ? `Bessere Möglichkeit: ${strongestMove.bestMove}${strongestMove.bestVariation.length > 1 ? `; übermittelte Hauptvariante: ${strongestMove.bestVariation.join(" ")}` : ""}.`
        : "Für diesen Moment wurde keine bessere Möglichkeit von Stockfish übermittelt.",
    );
    const additionalMoves = findings
      .filter((move) => move.ply !== strongestMove.ply)
      .sort((left, right) => right.centipawnLoss - left.centipawnLoss)
      .slice(0, 2);
    if (additionalMoves.length) {
      summary.push(`Weitere auffällige Momente: ${additionalMoves
        .map((move) => `Halbzug ${move.ply} ${moveLabel(move)} (${QUALITY_LABELS[move.quality]}, ${move.centipawnLoss} cp${move.bestMove ? `; Engine-Zug ${move.bestMove}` : ""})`)
        .join("; ")}.`);
    }
    summary.push(
      "Lernimpuls: Vergleiche an diesem Zug zuerst deinen Plan mit dem angegebenen Engine-Zug und prüfe dann nur die angezeigte Stockfish-Variante. So bleibt die Erklärung bei berechneten Möglichkeiten.",
    );
  } else {
    summary.push(
      "In den übermittelten Stockfish-Daten wurde kein auffälliger Zug gefunden. Das bedeutet nur, dass die hier analysierten Züge bei der verwendeten Suchtiefe nicht als Ungenauigkeit, Fehler oder schwerer Fehler eingestuft wurden; es ist kein Beweis für eine fehlerfreie Partie.",
      "Lernimpuls: Prüfe die Partie weiter anhand der angezeigten Engine-Bewertungen. Für konkrete Zugvorschläge ist eine Stockfish-Variante erforderlich.",
    );
  }

  return { explanation: summary.join("\n\n") };
}
