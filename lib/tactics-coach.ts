const WEAKNESS_THEME_ALIASES: Record<string, string[]> = {
  fork: ["gabel", "fork", "doppelangriff"],
  pin: ["fesselung", "pin"],
  skewer: ["spieß", "spiess", "skewer"],
  hangingPiece: ["ungedeckte figur", "ungedeckte figuren", "hangingpiece", "hanging piece"],
  discoveredAttack: ["abzug", "entdeckter angriff", "abzugangriff", "discovered attack"],
  discoveredCheck: ["abzugsschach", "discovered check"],
  backRankMate: ["grundreihenmatt", "backrankmate", "back rank mate"],
  exposedKing: ["königsangriff", "koenigsangriff", "exposedking", "exposed king"],
  attraction: ["ablenkung", "anlocken", "attraction"],
  deflection: ["ablenkung", "deflection"],
  sacrifice: ["opfer", "sacrifice"],
  promotion: ["umwandlung", "promotion"],
  advancedPawn: ["freibauer", "weit vorgerückter bauer", "advanced pawn"],
  trappedPiece: ["eingesperrte figur", "trapped piece"],
  endgame: ["endspiel", "endgame"],
  opening: ["eröffnung", "eroeffnung", "opening"],
  middlegame: ["mittelspiel", "middlegame"],
};

const THEME_EXPLANATIONS: Record<string, string> = {
  fork: "Eine Gabel greift mit einem Zug mehrere gegnerische Ziele gleichzeitig an.",
  pin: "Bei einer Fesselung kann eine Figur nicht oder nur unter einem Nachteil wegziehen, weil dahinter ein wertvolles Ziel steht.",
  skewer: "Beim Spieß wird ein wertvolles Ziel angegriffen; weicht es aus, kann dahinter eine weitere Figur verloren gehen.",
  hangingPiece: "Das Motiv weist auf eine ungedeckte oder unzureichend geschützte Figur hin.",
  discoveredAttack: "Beim Abzug greift eine Figur weg und öffnet dadurch den Angriff einer dahinterstehenden Figur.",
  discoveredCheck: "Beim Abzugsschach öffnet ein Zug den Angriff einer dahinterstehenden Figur auf den König.",
  backRankMate: "Ein Grundreihenmatt nutzt die eingeschränkten Fluchtfelder des Königs auf seiner Grundreihe.",
  exposedKing: "Das Motiv richtet den Blick auf die Sicherheit des Königs und mögliche forcierte Angriffe.",
  attraction: "Bei einer Ablenkung wird eine gegnerische Figur von einer wichtigen Aufgabe oder einem Feld weggezogen.",
  deflection: "Bei einer Ablenkung wird eine gegnerische Figur von einer wichtigen Aufgabe oder einem Feld weggezogen.",
  sacrifice: "Ein Opfer gibt Material ab, um dafür einen konkreten taktischen Vorteil zu erhalten.",
  promotion: "Bei einer Umwandlung wird ein Bauer zur stärkeren Figur und kann dadurch entscheidend werden.",
  advancedPawn: "Ein weit vorgerückter Bauer kann durch seine Umwandlungsdrohung gegnerische Figuren binden.",
  trappedPiece: "Eine eingesperrte Figur hat nur eingeschränkte Fluchtfelder und kann dadurch angreifbar sein.",
};

const HINTS: Record<string, [string, string]> = {
  fork: [
    "Suche nach einem Doppelangriff: Kann ein Zug gleichzeitig zwei gegnerische Ziele bedrohen?",
    "Prüfe besonders, ob ein Schachgebot mit einem Angriff auf eine weitere Figur verbunden werden kann.",
  ],
  pin: [
    "Achte auf Figuren, die vor König oder Dame stehen und deshalb nicht frei wegziehen können.",
    "Prüfe, welches wertvolle Ziel hinter einer beweglichen gegnerischen Figur steht.",
  ],
  skewer: [
    "Suche nach einer Linie, auf der zwei gegnerische Figuren hintereinander stehen.",
    "Überlege, ob ein Angriff auf das vordere Ziel die dahinterstehende Figur freilegt.",
  ],
  hangingPiece: [
    "Prüfe, welche gegnerischen Figuren ungedeckt oder nur einmal gedeckt sind.",
    "Suche nach einem Zug, der eine ungedeckte Figur unmittelbar angreift oder eine Verteidigung überlastet.",
  ],
  discoveredAttack: [
    "Achte auf eine eigene Figur, die den Angriff einer dahinterstehenden Figur blockiert.",
    "Kann sich diese Figur mit Tempo bewegen und dabei eine zweite Drohung schaffen?",
  ],
  discoveredCheck: [
    "Prüfe, ob eine eigene Figur eine Angriffslinie zum gegnerischen König blockiert.",
    "Suche nach einem Zug, der diese Linie öffnet und zugleich eine weitere Drohung aufstellt.",
  ],
  backRankMate: [
    "Achte auf die Fluchtfelder des gegnerischen Königs und die Figuren, die seine Grundreihe bewachen.",
    "Suche nach einer Möglichkeit, die Grundreihe mit Tempo anzugreifen oder die Verteidigung abzulenken.",
  ],
  exposedKing: [
    "Beginne mit allen Schachgeboten und prüfe, wie viele sichere Antworten der König hat.",
    "Vergleiche die Schachgebote danach mit direkten Angriffen auf ungedeckte Figuren.",
  ],
  attraction: [
    "Überlege, ob sich eine gegnerische Verteidigungsfigur auf ein ungünstiges Feld locken lässt.",
    "Prüfe, welche Aufgabe eine verteidigende Figur erfüllt und was passiert, wenn sie diese aufgibt.",
  ],
  deflection: [
    "Achte auf eine gegnerische Figur, die mehrere wichtige Aufgaben gleichzeitig erfüllt.",
    "Suche nach einer Drohung, die diese Verteidigung mit Tempo von ihrer Aufgabe wegzieht.",
  ],
  sacrifice: [
    "Berechne zuerst Schachgebote und Schlagzüge, bevor du Material bewertest.",
    "Prüfe, ob ein Materialopfer eine forcierte Fortsetzung oder einen direkten Angriff ermöglicht.",
  ],
  promotion: [
    "Achte auf Bauern, die kurz vor der Umwandlung stehen, und darauf, wer sie aufhalten kann.",
    "Prüfe, ob ein Zug die Umwandlung vorbereitet oder eine gegnerische Umwandlung verhindert.",
  ],
  advancedPawn: [
    "Achte auf weit vorgerückte Bauern und darauf, welche gegnerischen Figuren sie aufhalten müssen.",
    "Prüfe, ob eine Umwandlungsdrohung eine Figur bindet oder eine taktische Ablenkung ermöglicht.",
  ],
  trappedPiece: [
    "Suche nach gegnerischen Figuren mit wenigen sicheren Rückzugsfeldern.",
    "Prüfe, ob ein Zug diese Fluchtfelder einschränkt oder die Figur mit Tempo angreift.",
  ],
};

export function getTacticsCoachTheme(themes: string[]): string | null {
  return themes.find((theme) => HINTS[theme] || THEME_EXPLANATIONS[theme]) ?? null;
}

export function getTacticsCoachHint(themes: string[], level: 1 | 2 | 3): string {
  const theme = getTacticsCoachTheme(themes);
  const hint = theme ? HINTS[theme] : undefined;
  if (level === 1) {
    return hint?.[0] ?? "Prüfe zuerst alle Schachgebote, Schlagzüge und direkten Drohungen.";
  }
  if (level === 2) {
    return hint?.[1] ?? "Suche nach einem Zug mit Tempo, der eine zweite Drohung vorbereitet.";
  }
  return "Berechne die forcierte Antwort des Gegners mit: Was ist die stärkste Erwiderung auf deine Drohung?";
}

export function getTacticsCoachExplanation(themes: string[]): string {
  const theme = getTacticsCoachTheme(themes);
  return theme && THEME_EXPLANATIONS[theme]
    ? THEME_EXPLANATIONS[theme]
    : "Vergleiche die Lösungsvariante Zug für Zug mit der Stellung und prüfe Schachgebote, Schlagzüge und direkte Drohungen.";
}

export function getPreferredTacticsThemes(memories: readonly string[]): string[] {
  const normalizedMemories = memories.map((memory) => memory.toLocaleLowerCase("de"));
  return Object.entries(WEAKNESS_THEME_ALIASES)
    .filter(([, aliases]) => normalizedMemories.some((memory) => aliases.some((alias) => memory.includes(alias))))
    .map(([theme]) => theme);
}
