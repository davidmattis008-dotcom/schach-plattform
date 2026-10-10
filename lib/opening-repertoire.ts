export type OpeningVariant = {
  id: string;
  name: string;
  description: string;
  eco?: string;
  moves: string[];
};

export type Opening = {
  id: string;
  name: string;
  side: "Weiß" | "Schwarz";
  idea: string;
  variants: OpeningVariant[];
};

export const openingRepertoire: Opening[] = [
  {
    id: "london",
    name: "Londoner System",
    side: "Weiß",
    idea: "Entwickle den Läufer früh nach f4 und baue eine stabile Stellung mit e3 und c3 auf.",
    variants: [
      {
        id: "london-main",
        name: "Hauptaufbau mit ...Nf6",
        description: "Entwickle ruhig, sichere den König und bereite den zentralen Vorstoß vor.",
        moves: "d4 d5 Bf4 Nf6 e3 e6 Nf3 c5 c3 Nc6 Nbd2 Bd6 Bd3 O-O O-O".split(" "),
      },
      {
        id: "london-fianchetto",
        name: "Nebenvariante mit ...Bf5",
        description: "Schwarz entwickelt den Läufer aktiv vor ...e6; Weiß baut das Zentrum weiter auf.",
        moves: "d4 d5 Bf4 Bf5 e3 e6 Nf3 Nf6 c3 c5 Nbd2 Nc6".split(" "),
      },
      {
        id: "london-early-c5",
        name: "Nebenvariante mit frühem ...c5",
        description: "Schwarz greift das Zentrum sofort an. Weiß entwickelt Figuren und hält das Zentrum beweglich.",
        moves: "d4 d5 Bf4 Nf6 e3 c5 c3 Nc6 Nf3 e6 Nbd2 Bd6".split(" "),
      },
    ],
  },
  {
    id: "italian",
    name: "Italienische Partie",
    side: "Weiß",
    idea: "Entwickle schnell, kontrolliere das Zentrum und bringe den König früh in Sicherheit.",
    variants: [
      {
        id: "italian-giuoco",
        name: "Giuoco Piano",
        description: "Beide Seiten entwickeln Läufer und Springer; Weiß bereitet c3 und d4 vor.",
        moves: "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O".split(" "),
      },
      {
        id: "italian-two-knights",
        name: "Zwei-Springer-Verteidigung",
        description: "Schwarz entwickelt den Springer nach f6 und greift den weißen e-Bauern an.",
        moves: "e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O".split(" "),
      },
      {
        id: "italian-evans",
        name: "Evans-Gambit",
        description: "Weiß gibt den b-Bauern für schnelles Zentrumsspiel und aktive Figuren her.",
        moves: "e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 exd4 O-O".split(" "),
      },
    ],
  },
  {
    id: "queens-gambit",
    name: "Damengambit",
    side: "Weiß",
    idea: "Mit c4 setzt du d5 unter Druck und kämpfst um Raum im Zentrum.",
    variants: [
      {
        id: "queens-gambit-declined",
        name: "Abgelehnt mit ...e6",
        description: "Schwarz stützt das Zentrum. Weiß entwickelt Figuren und übt weiter Druck auf d5 aus.",
        moves: "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3".split(" "),
      },
      {
        id: "queens-gambit-accepted",
        name: "Angenommen mit ...dxc4",
        description: "Schwarz nimmt den Bauern; Weiß entwickelt sich zügig und kann den Bauern zurückgewinnen.",
        moves: "d4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6".split(" "),
      },
      {
        id: "queens-gambit-slav",
        name: "Slawische Verteidigung",
        description: "Schwarz stützt d5 mit ...c6 und entwickelt den Läufer außerhalb der Bauernkette.",
        moves: "d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4".split(" "),
      },
    ],
  },
  {
    id: "spanish",
    name: "Spanische Partie",
    side: "Weiß",
    idea: "Der Läufer greift den Springer c6 an. Entwickle ruhig weiter und bereite d4 vor.",
    variants: [
      {
        id: "spanish-closed",
        name: "Geschlossene Verteidigung",
        description: "Schwarz sichert den Springer mit ...a6 und entwickelt sich mit ...Be7 solide.",
        moves: "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O".split(" "),
      },
      {
        id: "spanish-berlin",
        name: "Berliner Verteidigung",
        description: "Schwarz entwickelt den Springer nach f6 und sucht früh aktives Gegenspiel.",
        moves: "e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5 Qxd8+ Kxd8".split(" "),
      },
      {
        id: "spanish-morphy",
        name: "Morphy-Verteidigung",
        description: "Mit ...a6 fragt Schwarz den Läufer, bevor die Figurenentwicklung weitergeht.",
        moves: "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 d3 b5 Bb3 Be7 O-O O-O".split(" "),
      },
    ],
  },
  {
    id: "scotch",
    name: "Schottische Partie",
    side: "Weiß",
    idea: "Mit d4 öffnest du früh das Zentrum und entwickelst deine Figuren aktiv.",
    variants: [
      {
        id: "scotch-main",
        name: "Hauptvariante mit ...Nf6",
        description: "Nach dem Tausch im Zentrum entwickelt Schwarz den Springer mit Tempo.",
        moves: "e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nc3 Bb4 Bd3 O-O O-O Re8".split(" "),
      },
      {
        id: "scotch-classical",
        name: "Klassische Verteidigung",
        description: "Schwarz entwickelt den Läufer aktiv nach c5 und nimmt das Zentrum ins Visier.",
        moves: "e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Be3 Qf6 c3 Nge7".split(" "),
      },
      {
        id: "scotch-four-knights",
        name: "Vier-Springer-Variante",
        description: "Beide Seiten entwickeln Springer; Weiß öffnet das Zentrum mit d4.",
        moves: "e4 e5 Nf3 Nc6 Nc3 Nf6 d4 exd4 Nxd4 Bb4 Nxc6 bxc6 Bd3 d5".split(" "),
      },
    ],
  },
  {
    id: "sicilian",
    name: "Sizilianische Verteidigung",
    side: "Schwarz",
    idea: "Bekämpfe e4 mit einem Flankenbauern und erhalte ein dynamisches, asymmetrisches Spiel.",
    variants: [
      {
        id: "sicilian-najdorf",
        name: "Najdorf-Variante",
        description: "Mit ...a6 bereitest du ...e5 oder ...e6 vor und nimmst b5 unter Kontrolle.",
        moves: "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O O-O-O".split(" "),
      },
      {
        id: "sicilian-alapin",
        name: "Alapin-Variante",
        description: "Weiß spielt früh c3 statt d4; Schwarz entwickelt sich und greift das Zentrum an.",
        moves: "e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 cxd4 d6 Nf3 Nc6".split(" "),
      },
      {
        id: "sicilian-dragon",
        name: "Drachenvariante",
        description: "Schwarz fianchettiert den Läufer und richtet ihn auf das lange Zentrum aus.",
        moves: "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O Qd2 Nc6 O-O-O".split(" "),
      },
    ],
  },
  {
    id: "french",
    name: "Französische Verteidigung",
    side: "Schwarz",
    idea: "Mit ...e6 und ...d5 baust du ein stabiles Zentrum auf und greifst es später an.",
    variants: [
      {
        id: "french-advance",
        name: "Vorstoßvariante",
        description: "Weiß schließt das Zentrum mit e5; Schwarz kontert mit ...c5.",
        moves: "e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 Be2 cxd4 cxd4 Nge7 O-O".split(" "),
      },
      {
        id: "french-exchange",
        name: "Abtauschvariante",
        description: "Frühe Abtausche ergeben eine offene Stellung mit vielen symmetrischen Ideen.",
        moves: "e4 e6 d4 d5 exd5 exd5 Nc3 Nf6 Bg5 Be7 Nf3 O-O Bd3".split(" "),
      },
      {
        id: "french-winawer",
        name: "Winawer-Variante",
        description: "Schwarz fesselt den Springer c3 mit ...Bb4 und kämpft um das Zentrum.",
        moves: "e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3 Ne7 Nf3 Nbc6 Bd3 c4 Be2".split(" "),
      },
    ],
  },
  {
    id: "caro-kann",
    name: "Caro-Kann-Verteidigung",
    side: "Schwarz",
    idea: "Unterstütze ...d5 zunächst mit ...c6 und erhalte eine solide Bauernstruktur.",
    variants: [
      {
        id: "caro-classical",
        name: "Klassische Variante",
        description: "Nach dem Tausch auf e4 entwickelt Schwarz den Läufer vor ...e6.",
        moves: "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 Nf3 Nd7 Bd3 Bxd3 Qxd3 e6 O-O Ngf6".split(" "),
      },
      {
        id: "caro-advance",
        name: "Vorstoßvariante",
        description: "Weiß gewinnt Raum mit e5; Schwarz greift die Bauernkette mit ...c5 an.",
        moves: "e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 O-O Nc6".split(" "),
      },
      {
        id: "caro-exchange",
        name: "Abtauschvariante",
        description: "Weiß tauscht früh auf d5; Schwarz entwickelt Springer und Läufer normal.",
        moves: "e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6 Bf4 Bg4".split(" "),
      },
    ],
  },
  {
    id: "queens-gambit-declined-black",
    name: "Damengambit abgelehnt",
    side: "Schwarz",
    idea: "Halte mit ...d5 und ...e6 das Zentrum und entwickle dich solide gegen den c-Bauern.",
    variants: [
      {
        id: "qgd-orthodox",
        name: "Orthodoxe Hauptvariante",
        description: "Schwarz entwickelt beide Springer und Läufer, bevor das Zentrum geschlossen wird.",
        moves: "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4".split(" "),
      },
      {
        id: "qgd-exchange",
        name: "Abtauschvariante",
        description: "Weiß nimmt auf d5; Schwarz schlägt zurück und erhält eine klare Bauernstruktur.",
        moves: "d4 d5 c4 e6 Nc3 Nf6 cxd5 exd5 Bg5 Be7 e3 O-O Bd3 c6".split(" "),
      },
      {
        id: "qgd-early-bishop",
        name: "Läuferentwicklung mit ...Bf5",
        description: "Schwarz entwickelt den Läufer vor ...e6 und hält die Stellung flexibel.",
        moves: "d4 d5 c4 c6 Nc3 Nf6 Nf3 Bf5 e3 e6 Bd3 Bxd3 Qxd3".split(" "),
      },
    ],
  },
  {
    id: "kings-indian",
    name: "Königsindische Verteidigung",
    side: "Schwarz",
    idea: "Fianchettiere den Läufer und greife das weiße Zentrum später mit Bauernvorstößen an.",
    variants: [
      {
        id: "kid-classical",
        name: "Klassische Variante",
        description: "Nach ...e5 entsteht ein geschlossenes Zentrum mit Angriffsmöglichkeiten für beide Seiten.",
        moves: "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7".split(" "),
      },
      {
        id: "kid-samisch",
        name: "Sämisch-Variante",
        description: "Weiß sichert das Zentrum mit f3; Schwarz bereitet den Vorstoß ...f5 vor.",
        moves: "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f3 O-O Be3 e5 d5 Nh5 Qd2 f5".split(" "),
      },
      {
        id: "kid-fianchetto",
        name: "Fianchetto-System",
        description: "Weiß entwickelt den Läufer nach g2 und kontrolliert das Zentrum aus der Distanz.",
        moves: "d4 Nf6 c4 g6 g3 Bg7 Bg2 O-O Nf3 d6 O-O Nc6 Nc3 e5".split(" "),
      },
    ],
  },
  {
    id: "vienna",
    name: "Wiener Partie",
    side: "Weiß",
    idea: "Mit Nc3 unterstützt Weiß e4 und hält sowohl f4 als auch d4 als zentrale Vorstöße bereit.",
    variants: [
      {
        id: "vienna-main",
        name: "Hauptvariante mit ...Nf6",
        description: "Weiß entwickelt den Springer und bereitet den Vorstoß f4 vor.",
        moves: "e4 e5 Nc3 Nf6 f4 d5 fxe5 Nxe4 Nf3 Be7 d4 O-O Bd3".split(" "),
      },
      {
        id: "vienna-gambit",
        name: "Wiener Gambit",
        description: "Weiß spielt f4 früh und kämpft um das Zentrum.",
        moves: "e4 e5 Nc3 Nc6 f4 exf4 Nf3 g5 d4 g4 Bc4".split(" "),
      },
    ],
  },
  {
    id: "kings-gambit",
    name: "Königsgambit",
    side: "Weiß",
    idea: "Weiß gibt den f-Bauern, um Linien zu öffnen und das Zentrum schnell zu besetzen.",
    variants: [
      {
        id: "kings-gambit-accepted",
        name: "Angenommenes Königsgambit",
        description: "Schwarz nimmt den Bauern; Weiß entwickelt sich mit Tempo und greift f7 an.",
        moves: "e4 e5 f4 exf4 Nf3 g5 Bc4 g4 O-O gxf3 Qxf3".split(" "),
      },
      {
        id: "kings-gambit-declined",
        name: "Abgelehnt mit ...Bc5",
        description: "Schwarz lehnt den Bauern ab und entwickelt den Läufer aktiv.",
        moves: "e4 e5 f4 Bc5 Nf3 d6 c3 Nf6 d4 exd4 cxd4 Bb6 Nc3".split(" "),
      },
    ],
  },
  {
    id: "four-knights",
    name: "Vier-Springer-Spiel",
    side: "Weiß",
    idea: "Beide Seiten entwickeln ihre Springer auf natürliche Felder und kämpfen um d4 und d5.",
    variants: [
      {
        id: "four-knights-main",
        name: "Spanische Vier-Springer-Variante",
        description: "Weiß fesselt den Springer c6 und entwickelt sich klassisch.",
        moves: "e4 e5 Nf3 Nc6 Nc3 Nf6 Bb5 Bb4 O-O O-O d3 d6 Bg5".split(" "),
      },
      {
        id: "four-knights-scotch",
        name: "Schottische Vier-Springer-Variante",
        description: "Weiß öffnet das Zentrum mit d4, sobald beide Springer entwickelt sind.",
        moves: "e4 e5 Nf3 Nc6 Nc3 Nf6 d4 Bb4 dxe5 Nxe4 Bd3 Nxc3 bxc3".split(" "),
      },
    ],
  },
  {
    id: "petrov",
    name: "Petrow-Verteidigung",
    side: "Schwarz",
    idea: "Schwarz antwortet auf Nf3 symmetrisch mit ...Nf6 und greift den weißen e-Bauern an.",
    variants: [
      {
        id: "petrov-main",
        name: "Klassische Variante",
        description: "Nach dem Springertausch entwickelt Schwarz die Dame und hält die Stellung ausgeglichen.",
        moves: "e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3 Bd6 O-O O-O".split(" "),
      },
      {
        id: "petrov-three-knights",
        name: "Drei-Springer-Variante",
        description: "Weiß entwickelt ruhig Nc3 und vermeidet zunächst den Tausch im Zentrum.",
        moves: "e4 e5 Nf3 Nf6 Nc3 Nc6 Bb5 Bb4 O-O O-O d3 d6".split(" "),
      },
    ],
  },
  {
    id: "scandinavian",
    name: "Skandinavische Verteidigung",
    side: "Schwarz",
    idea: "Schwarz greift den e-Bauern sofort mit ...d5 an und entscheidet früh über die Bauernstruktur.",
    variants: [
      {
        id: "scandinavian-queen",
        name: "Damenvariante mit ...Qxd5",
        description: "Die Dame nimmt zurück und zieht nach Nc3 meist auf einen sicheren Platz.",
        moves: "e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6 Bc4 Bf5 O-O e6".split(" "),
      },
      {
        id: "scandinavian-modern",
        name: "Moderne Variante mit ...Nf6",
        description: "Schwarz entwickelt erst den Springer und nimmt den Bauern später zurück.",
        moves: "e4 d5 exd5 Nf6 d4 Nxd5 Nf3 g6 c4 Nb6 Nc3 Bg7 Be2 O-O".split(" "),
      },
    ],
  },
  {
    id: "pirc",
    name: "Pirc-Verteidigung",
    side: "Schwarz",
    idea: "Schwarz lässt Weiß Raum im Zentrum und greift die Bauern später mit Figuren und Flankenbauern an.",
    variants: [
      {
        id: "pirc-classical",
        name: "Klassisches System",
        description: "Schwarz fianchettiert den Läufer und entwickelt den Springer nach f6.",
        moves: "e4 d6 d4 Nf6 Nc3 g6 Nf3 Bg7 Be2 O-O O-O Nc6 Be3 e5".split(" "),
      },
      {
        id: "pirc-austrian",
        name: "Österreichischer Angriff",
        description: "Weiß besetzt das Zentrum mit f4; Schwarz zielt auf Gegenspiel gegen d4.",
        moves: "e4 d6 d4 Nf6 Nc3 g6 f4 Bg7 Nf3 O-O Bd3 Nc6 O-O e5".split(" "),
      },
    ],
  },
  {
    id: "alekhine",
    name: "Aljechin-Verteidigung",
    side: "Schwarz",
    idea: "Schwarz provoziert weiße Bauernvorstöße und greift das große Zentrum anschließend an.",
    variants: [
      {
        id: "alekhine-four-pawns",
        name: "Vier-Bauern-Angriff",
        description: "Weiß baut ein großes Zentrum auf; Schwarz kontert mit ...c5.",
        moves: "e4 Nf6 e5 Nd5 d4 d6 c4 Nb6 f4 dxe5 fxe5 Nc6 Be3 Bf5 Nc3 e6".split(" "),
      },
      {
        id: "alekhine-modern",
        name: "Moderne Variante",
        description: "Weiß sichert e5 und entwickelt sich, während Schwarz das Zentrum vorbereitet angreift.",
        moves: "e4 Nf6 e5 Nd5 d4 d6 Nf3 g6 c4 Nb6 exd6 cxd6 Nc3 Bg7".split(" "),
      },
    ],
  },
  {
    id: "english",
    name: "Englische Eröffnung",
    side: "Weiß",
    idea: "Mit c4 kontrolliert Weiß das Zentrum aus der Flanke und kann flexibel aufbauen.",
    variants: [
      {
        id: "english-symmetrical",
        name: "Symmetrische Variante",
        description: "Schwarz antwortet ebenfalls mit c5; Weiß entwickelt den Springer und den Königsflügel.",
        moves: "c4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 Nf3 Nf6 O-O O-O d3".split(" "),
      },
      {
        id: "english-reversed-sicilian",
        name: "Umgekehrte Sizilianische Partie",
        description: "Weiß fianchettiert den Läufer und bereitet d4 oder e4 vor.",
        moves: "c4 e5 Nc3 Nf6 g3 d5 cxd5 Nxd5 Bg2 Nb6 Nf3 Nc6 O-O".split(" "),
      },
    ],
  },
  {
    id: "reti",
    name: "Réti-Eröffnung",
    side: "Weiß",
    idea: "Weiß entwickelt den Springer nach f3 und kontrolliert das Zentrum zunächst aus der Distanz.",
    variants: [
      {
        id: "reti-classical",
        name: "Klassischer Aufbau",
        description: "Weiß fianchettiert den Läufer und bereitet den zentralen Vorstoß vor.",
        moves: "Nf3 d5 c4 e6 g3 Nf6 Bg2 Be7 O-O O-O d4".split(" "),
      },
      {
        id: "reti-symmetrical",
        name: "Symmetrische Variante",
        description: "Beide Seiten entwickeln den Springer; Weiß setzt mit c4 Druck auf d5.",
        moves: "Nf3 Nf6 c4 c5 g3 Nc6 Bg2 e6 O-O Be7 d4 O-O".split(" "),
      },
    ],
  },
  {
    id: "nimzo-indian",
    name: "Nimzo-Indische Verteidigung",
    side: "Schwarz",
    idea: "Schwarz fesselt den Springer c3 und kämpft mit Figuren gegen das weiße Zentrum.",
    variants: [
      {
        id: "nimzo-classical",
        name: "Klassische Variante",
        description: "Weiß entwickelt die Dame; Schwarz nimmt c3 ins Visier und entwickelt sich zügig.",
        moves: "d4 Nf6 c4 e6 Nc3 Bb4 Qc2 O-O a3 Bxc3+ Qxc3 b6 Bg5 Bb7".split(" "),
      },
      {
        id: "nimzo-rubinstein",
        name: "Rubinstein-System",
        description: "Weiß entwickelt den Springer und verstärkt das Zentrum mit e3.",
        moves: "d4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O Nc6".split(" "),
      },
    ],
  },
  {
    id: "queens-indian",
    name: "Damenindische Verteidigung",
    side: "Schwarz",
    idea: "Schwarz kontrolliert das zentrale Feld e4 mit einem Fianchetto und entwickelt sich solide.",
    variants: [
      {
        id: "queens-indian-main",
        name: "Hauptvariante mit ...Bb7",
        description: "Schwarz entwickelt den Läufer nach b7 und übt Druck auf das Zentrum aus.",
        moves: "d4 Nf6 c4 e6 Nf3 b6 g3 Bb7 Bg2 Be7 O-O O-O Nc3 Ne4".split(" "),
      },
      {
        id: "queens-indian-early-bishop",
        name: "Variante mit ...Ba6",
        description: "Der Läufer greift c4 an, bevor Schwarz die Entwicklung abschließt.",
        moves: "d4 Nf6 c4 e6 Nf3 b6 a3 Bb7 Nc3 Be7 Qc2 O-O e4 d5".split(" "),
      },
    ],
  },
  {
    id: "grunfeld",
    name: "Grünfeld-Indische Verteidigung",
    side: "Schwarz",
    idea: "Schwarz erlaubt ein großes weißes Zentrum und greift es mit Figuren und ...c5 an.",
    variants: [
      {
        id: "grunfeld-exchange",
        name: "Tauschvariante",
        description: "Weiß baut mit e4 ein starkes Zentrum auf; Schwarz entwickelt den Läufer nach g7.",
        moves: "d4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7 Nf3 c5".split(" "),
      },
      {
        id: "grunfeld-russian",
        name: "Russisches System",
        description: "Weiß unterstützt das Zentrum mit Qb3 und erhöht den Druck auf d5.",
        moves: "d4 Nf6 c4 g6 Nc3 d5 Nf3 Bg7 Qb3 dxc4 Qxc4 O-O e4".split(" "),
      },
    ],
  },
  {
    id: "dutch",
    name: "Holländische Verteidigung",
    side: "Schwarz",
    idea: "Mit ...f5 beansprucht Schwarz Raum am Königsflügel und bereitet einen Angriff vor.",
    variants: [
      {
        id: "dutch-stonewall",
        name: "Stonewall-Aufbau",
        description: "Schwarz baut ein festes Bauernzentrum mit ...f5, ...e6 und ...d5.",
        moves: "d4 f5 c4 Nf6 g3 e6 Bg2 d5 Nf3 c6 O-O Bd6".split(" "),
      },
      {
        id: "dutch-leningrad",
        name: "Leningrader System",
        description: "Schwarz fianchettiert den Läufer und behält den Vorstoß ...e5 im Blick.",
        moves: "d4 f5 g3 Nf6 Bg2 g6 Nf3 Bg7 O-O O-O c4 d6 Nc3 Qe8".split(" "),
      },
    ],
  },
  {
    id: "benoni",
    name: "Moderne Benoni-Verteidigung",
    side: "Schwarz",
    idea: "Schwarz nimmt eine asymmetrische Bauernstruktur an und erhält aktives Gegenspiel am Damenflügel.",
    variants: [
      {
        id: "benoni-main",
        name: "Hauptvariante",
        description: "Nach ...c5 und ...e6 entsteht ein dynamisches Zentrum mit ungleichen Bauernmehrheiten.",
        moves: "d4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6 Nf3 g6 e4 Bg7".split(" "),
      },
      {
        id: "benoni-fianchetto",
        name: "Fianchetto-System",
        description: "Weiß entwickelt den Läufer nach g2 und kontrolliert die langen Diagonalen.",
        moves: "d4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6 g3 g6 Bg2 Bg7 Nf3".split(" "),
      },
    ],
  },
  {
    id: "catalan",
    name: "Katalanische Eröffnung",
    side: "Weiß",
    idea: "Weiß kombiniert d4 und c4 mit einem Fianchetto und übt langfristigen Druck auf das Zentrum aus.",
    variants: [
      {
        id: "catalan-open",
        name: "Offene Variante",
        description: "Schwarz nimmt den c-Bauern; Weiß entwickelt den Läufer auf die lange Diagonale.",
        moves: "d4 Nf6 c4 e6 g3 d5 Bg2 dxc4 Nf3 Be7 O-O O-O Qc2 a6".split(" "),
      },
      {
        id: "catalan-closed",
        name: "Geschlossene Variante",
        description: "Schwarz hält das Zentrum geschlossen und entwickelt sich hinter der Bauernkette.",
        moves: "d4 Nf6 c4 e6 g3 d5 Bg2 Be7 Nf3 O-O O-O c6 Qc2 Nbd7".split(" "),
      },
    ],
  },
  {
    id: "slav",
    name: "Slawische Verteidigung",
    side: "Schwarz",
    idea: "Schwarz stützt den d-Bauern mit ...c6 und hält den Läufer c8 außerhalb der Bauernkette.",
    variants: [
      {
        id: "slav-main",
        name: "Hauptvariante",
        description: "Weiß nimmt auf c4; Schwarz entwickelt den Läufer aktiv nach f5.",
        moves: "d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4".split(" "),
      },
      {
        id: "slav-exchange",
        name: "Abtauschvariante",
        description: "Weiß tauscht früh auf d5; Schwarz nimmt mit dem c-Bauern zurück.",
        moves: "d4 d5 c4 c6 cxd5 cxd5 Nc3 Nf6 Nf3 Nc6 Bf4 Bf5".split(" "),
      },
    ],
  },
  {
    id: "benko",
    name: "Benko-Gambit",
    side: "Schwarz",
    idea: "Schwarz gibt einen Bauern, um dauerhaften Druck auf den offenen Damenflügellinien aufzubauen.",
    variants: [
      {
        id: "benko-main",
        name: "Angenommenes Gambit",
        description: "Weiß nimmt beide Bauern; Schwarz öffnet die a- und b-Linie für seine Türme.",
        moves: "d4 Nf6 c4 c5 d5 b5 cxb5 a6 bxa6 Bxa6 Nc3 d6 e4 Bxf1 Kxf1 g6".split(" "),
      },
      {
        id: "benko-declined",
        name: "Abgelehnt mit e3",
        description: "Weiß lehnt das Gambit ab und stützt das Zentrum.",
        moves: "d4 Nf6 c4 c5 d5 b5 e3 bxc4 Bxc4 g6 Nc3 Bg7 Nf3 O-O".split(" "),
      },
    ],
  },
  {
    id: "modern",
    name: "Moderne Verteidigung",
    side: "Schwarz",
    idea: "Schwarz entwickelt den Läufer nach g7 und wartet flexibel ab, wie Weiß das Zentrum aufbaut.",
    variants: [
      {
        id: "modern-austrian",
        name: "Österreichischer Aufbau",
        description: "Weiß besetzt das Zentrum; Schwarz fianchettiert und kontert später mit ...c5.",
        moves: "e4 g6 d4 Bg7 Nc3 d6 f4 Nf6 Nf3 O-O Bd3 c5 d5 e6 O-O".split(" "),
      },
      {
        id: "modern-robatsch",
        name: "Robatsch-System",
        description: "Weiß entwickelt die Springer, während Schwarz den Läufer nach g7 bringt.",
        moves: "e4 g6 d4 Bg7 Nc3 d6 Nf3 a6 Be2 b5 O-O Bb7".split(" "),
      },
    ],
  },
  {
    id: "bird",
    name: "Bird-Eröffnung",
    side: "Weiß",
    idea: "Mit f4 kontrolliert Weiß e5 und kann einen Aufbau nach holländischem Muster wählen.",
    variants: [
      {
        id: "bird-dutch",
        name: "Holländischer Aufbau",
        description: "Weiß entwickelt den Königsflügel und bereitet e3 und d4 vor.",
        moves: "f4 d5 Nf3 Nf6 e3 e6 b3 Be7 Bb2 O-O Bd3 c5 O-O Nc6".split(" "),
      },
      {
        id: "bird-from",
        name: "Froms Gambit",
        description: "Schwarz kontert f4 sofort mit ...e5 und öffnet Linien.",
        moves: "f4 e5 fxe5 d6 exd6 Bxd6 Nf3 g5 d4 g4 Ne5 Bxe5 dxe5 Qxd1+ Kxd1".split(" "),
      },
    ],
  },
  {
    id: "trompowsky",
    name: "Trompowsky-Angriff",
    side: "Weiß",
    idea: "Weiß entwickelt den Läufer früh nach g5 und stellt Schwarz vor eine konkrete Entscheidung.",
    variants: [
      {
        id: "trompowsky-main",
        name: "Hauptvariante mit ...Ne4",
        description: "Schwarz greift den Läufer sofort mit dem Springer an.",
        moves: "d4 Nf6 Bg5 Ne4 Bf4 d5 e3 c5 Bd3 Nc6 c3 Bf5".split(" "),
      },
      {
        id: "trompowsky-fianchetto",
        name: "Fianchetto-System",
        description: "Schwarz entwickelt den Läufer nach g7 und baut eine flexible Stellung auf.",
        moves: "d4 Nf6 Bg5 g6 Bxf6 exf6 e4 Bg7 Nc3 O-O Qd2 d6 O-O-O".split(" "),
      },
    ],
  },
  {
    id: "budapest",
    name: "Budapester Gambit",
    side: "Schwarz",
    idea: "Schwarz opfert nach 1.d4 Nf6 2.c4 e5 einen Bauern für schnelle Entwicklung und aktives Spiel.",
    variants: [
      {
        id: "budapest-main",
        name: "Fajarowicz-Variante",
        description: "Schwarz entwickelt den Springer nach c6 und greift den Bauern e5 an.",
        moves: "d4 Nf6 c4 e5 dxe5 Ne4 Nf3 Nc6 a3 d6 exd6 Bxd6".split(" "),
      },
      {
        id: "budapest-accepted",
        name: "Angenommenes Gambit",
        description: "Weiß hält den Bauern; Schwarz entwickelt den Springer aktiv nach g4.",
        moves: "d4 Nf6 c4 e5 dxe5 Ng4 Nf3 Bc5 e3 Nc6 Be2 O-O O-O".split(" "),
      },
    ],
  },
];
