export type LearningLesson = {
  id: string;
  title: string;
  minutes: number;
  introduction: string;
  takeaways: string[];
  exampleFen?: string;
  exampleDescription?: string;
  question: string;
  answers: string[];
  correctAnswer: number;
  explanation: string;
  practice?: { label: string; href: string };
};

export type LearningPath = {
  id: string;
  title: string;
  description: string;
  lessonIds: string[];
};

export const learningPaths: LearningPath[] = [
  {
    id: "anfang",
    title: "1. Schach von Anfang an",
    description: "Brett, Figuren und Regeln – ganz ohne Vorwissen.",
    lessonIds: ["brett", "figuren", "schach-matt", "sonderzuege"],
  },
  {
    id: "taktik",
    title: "2. Gute Züge finden",
    description: "Sicher eröffnen und vor jedem Zug die Gefahren prüfen.",
    lessonIds: ["eroeffnung", "zugpruefung", "taktikmotive"],
  },
  {
    id: "matt",
    title: "3. Mattsetzen lernen",
    description: "Übe die grundlegenden Mattführungen mit Dame und Turm.",
    lessonIds: ["damenmatt", "turmmatt"],
  },
  {
    id: "endspiele",
    title: "4. Endspiele und Fortgeschrittene",
    description: "Wenige Figuren auf dem Brett – hier zählen genaue Pläne.",
    lessonIds: ["bauernendspiel", "turmendspiel", "stellungsplan"],
  },
];

export const learningLessons: LearningLesson[] = [
  {
    id: "brett",
    title: "Das Brett und die Startaufstellung",
    minutes: 4,
    introduction: "Ein Schachbrett hat 64 Felder. Damit die Aufstellung stimmt, liegt aus Sicht beider Spielenden das helle Feld rechts unten. Die Reihen werden mit 1 bis 8, die Spalten mit a bis h bezeichnet. So hat jedes Feld einen eindeutigen Namen.",
    takeaways: [
      "Weiß beginnt; die weißen Figuren stehen auf den Reihen 1 und 2.",
      "Die Türme stehen in den Ecken, daneben Springer und Läufer.",
      "Die Dame steht auf ihrer eigenen Farbe: weiße Dame auf einem hellen, schwarze Dame auf einem dunklen Feld.",
      "Der König steht neben der Dame. Die Bauern bilden die Reihe davor.",
    ],
    exampleFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    exampleDescription: "Die normale Startaufstellung: Aus Sicht der weißen Seite liegt ein helles Feld rechts unten.",
    question: "Welche Regel hilft dir, Dame und König richtig aufzustellen?",
    answers: ["Die Dame steht immer auf ihrer eigenen Feldfarbe.", "Die Dame steht immer rechts vom König.", "Die Dame steht in einer Ecke."],
    correctAnswer: 0,
    explanation: "Genau: Die weiße Dame steht auf einem weißen Feld, die schwarze Dame auf einem schwarzen Feld.",
  },
  {
    id: "figuren",
    title: "So ziehen die Figuren",
    minutes: 6,
    introduction: "Jede Figur hat ihren eigenen Weg. Eine Figur darf keine eigene Figur schlagen und – außer dem Springer – nicht über andere Figuren springen. Ein Zug endet auf einem Feld, das leer ist oder von einer gegnerischen Figur besetzt wird.",
    takeaways: [
      "Der Turm zieht beliebig weit gerade, der Läufer beliebig weit diagonal.",
      "Die Dame kombiniert Turm und Läufer; der König zieht ein Feld in jede Richtung.",
      "Der Springer zieht zwei Felder in eine Richtung und eines zur Seite. Er darf dabei springen.",
      "Bauern ziehen vorwärts, schlagen aber diagonal. Beim ersten Zug dürfen sie zwei Felder vorziehen, wenn beide frei sind.",
    ],
    question: "Welche Figur darf über andere Figuren springen?",
    answers: ["Der Läufer", "Der Springer", "Die Dame"],
    correctAnswer: 1,
    explanation: "Der Springer ist die einzige Figur, die über besetzte Felder springen kann.",
  },
  {
    id: "schach-matt",
    title: "Schach, Matt und Remis",
    minutes: 5,
    introduction: "Der König wird nicht geschlagen. Ist er angegriffen, steht er im Schach und der Angriff muss sofort abgewehrt werden: König wegziehen, Angreifer schlagen oder den Angriff blockieren. Gibt es keine legale Abwehr, ist es Schachmatt und die Partie vorbei.",
    takeaways: [
      "Du darfst keinen Zug machen, der deinen eigenen König im Schach stehen lässt.",
      "Schachmatt: Der König ist angegriffen und keine legale Abwehr ist möglich.",
      "Patt: Die Person am Zug hat keinen legalen Zug, steht aber nicht im Schach. Die Partie endet remis.",
      "Bei einem Remis gewinnt niemand; beide erhalten ein Unentschieden.",
    ],
    question: "Der König steht nicht im Schach, aber die Person am Zug hat keinen legalen Zug. Was ist das?",
    answers: ["Schachmatt", "Patt – die Partie ist remis", "Ein ungültiger Zug"],
    correctAnswer: 1,
    explanation: "Ohne Schach und ohne legalen Zug ist es Patt, also ein Remis – kein Matt.",
  },
  {
    id: "sonderzuege",
    title: "Rochade, Umwandlung und en passant",
    minutes: 5,
    introduction: "Neben den normalen Zügen gibt es drei Sonderregeln. Du musst sie nicht auswendig können, bevor du losspielst – aber sie früh zu kennen verhindert Überraschungen.",
    takeaways: [
      "Bei der Rochade ziehen König und Turm gemeinsam. Beide dürfen vorher nicht gezogen haben; zwischen ihnen muss frei sein und der König darf weder im Schach stehen noch ein angegriffenes Feld überqueren.",
      "Erreicht ein Bauer die letzte Reihe, wird er sofort in Dame, Turm, Läufer oder Springer umgewandelt – meistens in eine Dame.",
      "En passant ist ein besonderer Bauernschlag direkt nach einem gegnerischen Doppelschritt: Der eigene Bauer schlägt den vorbeigezogenen Bauern so, als wäre er nur ein Feld gezogen.",
      "En passant ist nur unmittelbar im nächsten Zug möglich.",
    ],
    question: "Wann darfst du en passant schlagen?",
    answers: ["Auch mehrere Züge später.", "Nur direkt nach dem Doppelschritt des gegnerischen Bauern.", "Nur wenn dein König im Schach steht."],
    correctAnswer: 1,
    explanation: "Dieser besondere Schlag ist nur direkt im Zug nach dem gegnerischen Doppelschritt erlaubt.",
  },
  {
    id: "eroeffnung",
    title: "Die ersten Züge: ein guter Start",
    minutes: 5,
    introduction: "Du brauchst keine Eröffnungsnamen auswendig zu lernen. Gute Eröffnungszüge helfen deinen Figuren, mitzumachen, während dein König sicher steht. Im Eröffnungsbereich kannst du vollständige Beispielzüge auf dem Brett ansehen.",
    takeaways: [
      "Kämpfe um das Zentrum: Die zentralen Felder geben Figuren mehr Bewegungsraum.",
      "Entwickle zuerst Springer und Läufer, statt dieselbe Figur ohne Grund oft zu ziehen.",
      "Bringe den König mit einer passenden Rochade in Sicherheit.",
      "Ziehe nicht früh mit der Dame auf Beutezug und lasse keine Figur ungedeckt stehen.",
    ],
    question: "Was ist ein guter allgemeiner Plan in den ersten Zügen?",
    answers: ["Die Dame sofort möglichst weit nach vorne bringen.", "Figuren entwickeln, das Zentrum beeinflussen und den König sichern.", "Mit möglichst vielen Bauern am Rand ziehen."],
    correctAnswer: 1,
    explanation: "Entwicklung, Zentrum und Königssicherheit sind verlässliche Eröffnungsziele. Konkrete Zugfolgen hängen von den gegnerischen Zügen ab.",
    practice: { label: "Eröffnungen Schritt für Schritt ansehen", href: "/repertoire" },
  },
  {
    id: "zugpruefung",
    title: "Vor jedem Zug: drei Fragen",
    minutes: 4,
    introduction: "Viele Anfängerfehler entstehen, weil man nur den eigenen Plan sieht. Nimm dir vor jedem Zug einen kurzen Moment und prüfe zuerst, was sich durch den letzten gegnerischen Zug verändert hat.",
    takeaways: [
      "Ist mein König bedroht?",
      "Greift mein Gegner gerade eine meiner Figuren an oder droht er etwas?",
      "Kann ich mit Schach, einem Schlag oder einer direkten Drohung etwas gewinnen?",
      "Nach meinem Zug: Kann der Gegner meine gezogene Figur einfach schlagen?",
    ],
    question: "Was solltest du nach dem gegnerischen Zug zuerst prüfen?",
    answers: ["Ob deine Dame ein schönes Zielfeld hat.", "Ob dein König oder eine deiner Figuren bedroht ist.", "Ob du schon an den nächsten fünf Zügen bist."],
    correctAnswer: 1,
    explanation: "Erst die unmittelbaren Gefahren prüfen, dann den eigenen Plan wählen.",
  },
  {
    id: "taktikmotive",
    title: "Gabel, Fesselung und Spieß",
    minutes: 6,
    introduction: "Eine Taktik nutzt eine konkrete Eigenschaft der Stellung. Bei einer Gabel greift eine Figur mehrere Ziele gleichzeitig an. Bei einer Fesselung kann eine angegriffene Figur nicht wegziehen, ohne dahinter eine wertvollere Figur oder den König preiszugeben.",
    takeaways: [
      "Gabel: Eine Figur greift gleichzeitig zwei oder mehr Ziele an.",
      "Fesselung: Eine Figur kann nicht gefahrlos wegziehen, weil dahinter ein wertvolles Ziel steht.",
      "Spieß: Das wertvolle vordere Ziel muss ausweichen und gibt dadurch ein Ziel dahinter frei.",
      "Suche nach ungedeckten Figuren und prüfe, ob ein Schachgebot mehrere Ziele bedroht.",
    ],
    question: "Dein Springer greift mit einem Zug gleichzeitig den König und einen Turm an. Welches Motiv ist das?",
    answers: ["Gabel", "Rochade", "Patt"],
    correctAnswer: 0,
    explanation: "Ein gleichzeitiger Angriff auf mehrere Ziele heißt Gabel. Ein Schachgebot macht sie oft besonders stark.",
    practice: { label: "Taktikaufgabe passend zu deiner Spielstärke lösen", href: "/taktik" },
  },
  {
    id: "damenmatt",
    title: "Mattsetzen mit König und Dame",
    minutes: 6,
    introduction: "König und Dame können einen alleinstehenden König mattsetzen. Die Dame sperrt ihm nach und nach mehr Felder ab; der eigene König kommt näher und hilft, den gegnerischen König einzuschränken. Dränge ihn an den Brettrand und setze ihn dort matt.",
    takeaways: [
      "Nutze die Dame, um den gegnerischen König in einen kleineren Bereich zu drängen.",
      "Rücke mit dem eigenen König heran – die Dame allein reicht für das Mattbild nicht immer.",
      "Lass dem König mindestens ein Feld, bis du das Matt wirklich vorbereitest. Zu wenig Felder kann Patt ergeben.",
      "Vor dem letzten Zug prüfe, ob der gegnerische König im Schach steht und kein legales Feld mehr hat.",
    ],
    exampleFen: "7k/6Q1/5K2/8/8/8/8/8 b - - 0 1",
    exampleDescription: "Mattbild mit Dame: Der schwarze König steht im Schach und kann weder entkommen noch die geschützte Dame schlagen.",
    question: "Warum darfst du den gegnerischen König nicht einfach einsperren, wenn er nicht im Schach steht?",
    answers: ["Weil das dann immer ein Matt ist.", "Weil es Patt und damit remis sein kann.", "Weil die Dame nicht allein ziehen darf."],
    correctAnswer: 1,
    explanation: "Ohne Schach und ohne legalen Zug ist es Patt. Sorge dafür, dass der letzte Zug wirklich Schach gibt.",
  },
  {
    id: "turmmatt",
    title: "Mattsetzen mit König und Turm",
    minutes: 6,
    introduction: "Mit König und Turm kannst du den gegnerischen König ebenfalls mattsetzen. Der Turm schneidet eine Reihe oder Linie ab, während dein König den gegnerischen König zurückdrängt. Arbeite Reihe für Reihe zum Rand.",
    takeaways: [
      "Der Turm hält den gegnerischen König hinter einer gedachten Linie.",
      "Der eigene König rückt vor und nimmt dem gegnerischen König Felder.",
      "Wenn der König heranläuft, weiche mit dem Turm aus, statt ihn unnötig zu tauschen.",
      "Am Rand entsteht das Matt, wenn König und Turm zusammenarbeiten.",
    ],
    exampleFen: "7k/5K2/8/8/8/8/8/7R b - - 0 1",
    exampleDescription: "Mattbild mit Turm: Der Turm sperrt die h-Linie, der weiße König kontrolliert die Fluchtfelder g7 und g8.",
    question: "Welche Aufgabe hat dein König beim Matt mit Turm?",
    answers: ["Er unterstützt den Turm und nimmt dem gegnerischen König Felder.", "Er muss den Turm vor dem gegnerischen König verstecken.", "Er darf sich nicht bewegen."],
    correctAnswer: 0,
    explanation: "Der eigene König hilft, den gegnerischen König zurückzudrängen; der Turm setzt die Sperre.",
  },
  {
    id: "bauernendspiel",
    title: "Bauernendspiele und Opposition",
    minutes: 6,
    introduction: "Wenn nur Könige und Bauern übrig sind, wird der König zur aktiven Figur. Er begleitet den eigenen Freibauern und versucht, den gegnerischen König abzudrängen. Bei der Opposition stehen sich die Könige mit einem Feld dazwischen gegenüber; wer nicht am Zug ist, kann oft die wichtige Sperre halten.",
    takeaways: [
      "Führe den König früh ins Zentrum und vor den eigenen Bauern.",
      "Ein Freibauer hat keinen gegnerischen Bauern mehr vor sich oder auf einer Nachbarlinie, der ihn aufhalten kann.",
      "Die Opposition kann dem eigenen König den Weg freimachen oder den gegnerischen König aussperren.",
      "Die Quadratregel hilft einzuschätzen, ob ein König einen weit entfernten Freibauern noch einholen kann.",
    ],
    exampleFen: "8/4k3/8/4K3/4P3/8/8/8 w - - 0 1",
    exampleDescription: "Ein einfaches Bauernendspiel: Der weiße König muss dem Bauern den Weg freimachen und zugleich die Opposition beachten.",
    question: "Welche Figur wird im Bauernendspiel besonders aktiv und wichtig?",
    answers: ["Der König", "Der bereits geschlagene Läufer", "Die Rochade"],
    correctAnswer: 0,
    explanation: "Ohne Schwerfiguren kämpft der König direkt um Felder und unterstützt die Bauern.",
  },
  {
    id: "turmendspiel",
    title: "Grundideen im Turmendspiel",
    minutes: 6,
    introduction: "Turmendspiele kommen häufig vor und sind oft remis, wenn die verteidigende Seite aktiv bleibt. Ein weit entfernter Freibauer bindet den gegnerischen König, und ein aktiver Turm kann von hinten angreifen oder Dauerschachs geben.",
    takeaways: [
      "Aktiviere deinen Turm: Passives Verteidigen auf der letzten Reihe lässt dem Gegner oft freie Hand.",
      "Ein Turm hinter dem eigenen Freibauern unterstützt ihn auf dem Weg zur Umwandlung.",
      "Wenn du verteidigst, suche nach Schachs von der Seite oder von hinten.",
      "Aktiviere auch den König, aber achte auf gegnerische Dauerschachs.",
    ],
    exampleFen: "6kr/5ppp/8/8/8/8/P5PP/5RK1 w - - 0 1",
    exampleDescription: "Beispiel für ein Turmendspiel: Beide Seiten haben einen Turm, die Könige und Bauern. Suche nach aktiven Turmzügen.",
    question: "Wo steht ein Turm häufig gut, wenn er den eigenen Freibauern unterstützt?",
    answers: ["Hinter dem Freibauern.", "Auf einem Randfeld ohne Verbindung zum Bauern.", "Immer direkt neben dem gegnerischen König."],
    correctAnswer: 0,
    explanation: "Von hinten kann der Turm den Bauern über die ganze Linie unterstützen, auch wenn er weiter vorrückt.",
  },
  {
    id: "stellungsplan",
    title: "Stellungsverständnis: den schlechtesten Stein verbessern",
    minutes: 7,
    introduction: "Wenn es keine unmittelbare Taktik gibt, verbessere die Stellung Schritt für Schritt. Ein einfacher Plan beginnt mit einer Frage: Welche meiner Figuren steht am schlechtesten, und wie kann sie aktiver werden?",
    takeaways: [
      "Vergleiche aktive und passive Figuren – nicht nur die Anzahl der Figuren.",
      "Nutze offene Linien für Türme und sichere Felder für Springer.",
      "Greife Schwächen an, die der Gegner nicht leicht mit einem Bauernzug verteidigen kann.",
      "Prüfe vor jedem ruhigen Plan erneut Schachs, Schläge und direkte Drohungen.",
    ],
    question: "Was ist ein guter Plan, wenn gerade keine Taktik möglich ist?",
    answers: ["Irgendeinen Bauern ziehen.", "Die am schlechtesten stehende eigene Figur verbessern.", "Die Partie als remis werten."],
    correctAnswer: 1,
    explanation: "Eine passive Figur auf ein aktives Feld zu bringen ist ein konkreter, oft guter Positionsplan.",
  },
];
