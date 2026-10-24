export const BOT_ELO_MIN = 0;
export const BOT_ELO_MAX = 3000;

export const FIXED_BOTS = [
  { elo: 300, name: "Bauer", icon: "♟" },
  { elo: 600, name: "Springer", icon: "♞" },
  { elo: 900, name: "Läufer", icon: "♝" },
  { elo: 1200, name: "Turm", icon: "♜" },
  { elo: 1500, name: "Dame", icon: "♛" },
  { elo: 1800, name: "Taktiker", icon: "♞" },
  { elo: 2100, name: "Stratege", icon: "♝" },
  { elo: 2400, name: "Experte", icon: "♜" },
  { elo: 2700, name: "Meister", icon: "♛" },
  { elo: 3000, name: "Großmeister", icon: "♚" },
] as const;
