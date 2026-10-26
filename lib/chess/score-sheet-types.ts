export type ScoreSheetHypothesis = {
  text: string;
};

export type ScoreSheetLine = {
  id: string;
  page: number;
  row: number;
  cropUrl: string;
  hypotheses: ScoreSheetHypothesis[];
};

export type ScoreSheetMove = {
  ply: number;
  san: string;
  confidence: number;
  corrected: boolean;
  page: number;
  row: number;
};

export type ScoreSheetIssue = {
  ply: number;
  page: number;
  row: number;
  kind: "ambiguous" | "low-confidence" | "unreadable" | "illegal" | "missing";
  candidates: string[];
  confidence: number;
};

export type ScoreSheetReview = {
  moves: ScoreSheetMove[];
  issue: ScoreSheetIssue | null;
  pgn: string;
};
