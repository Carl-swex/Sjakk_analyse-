import { Chess } from 'chess.js';
import type { EngineResult } from './engine';

export interface Position {
  fen: string;
  /** Move that led to this position (undefined for the start position). */
  san?: string;
  lan?: string;
  from?: string;
  to?: string;
  color?: 'w' | 'b';
}

export interface Eval {
  cp?: number;
  mate?: number;
  bestMove?: string;
}

export type Classification = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export interface MoveAnalysis {
  classification: Classification;
  /** Drop in win chance (0–100) for the side that moved. */
  winDrop: number;
  /** Lichess-style accuracy for this move (0–100). */
  accuracy: number;
}

export function parsePgn(pgn: string): { positions: Position[]; headers: Record<string, string> } {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const headers = chess.getHeaders() as Record<string, string>;
  const history = chess.history({ verbose: true });
  const positions: Position[] = [{ fen: history.length ? history[0].before : chess.fen() }];
  for (const m of history) {
    positions.push({ fen: m.after, san: m.san, lan: m.lan, from: m.from, to: m.to, color: m.color });
  }
  return { positions, headers };
}

/** Resolve positions the engine can't score (checkmate / stalemate / draws) directly. */
export function terminalEval(fen: string): Eval | null {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) return { mate: 0, cp: chess.turn() === 'w' ? -100000 : 100000 };
  if (chess.isDraw() || chess.isStalemate()) return { cp: 0 };
  return null;
}

export function fromEngine(r: EngineResult): Eval {
  return { cp: r.cp, mate: r.mate, bestMove: r.bestMove };
}

/** Centipawns from White's view, with mate mapped to a large value. */
export function evalToCp(e: Eval): number {
  if (e.mate !== undefined && e.mate !== 0) return Math.sign(e.mate) * 100000;
  return e.cp ?? 0;
}

/** Lichess win-chance formula, from White's perspective (0–100). */
export function winChance(cp: number): number {
  const c = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

export function winChanceWhite(e: Eval): number {
  return winChance(evalToCp(e));
}

/** Lichess per-move accuracy from win-chance before/after (mover's perspective). */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  const acc = 103.1668 * Math.exp(-0.04354 * (winBefore - winAfter)) - 3.1669;
  return Math.max(0, Math.min(100, acc));
}

export function classify(winDrop: number, isBest: boolean): Classification {
  if (isBest || winDrop < 2) return 'best';
  if (winDrop < 10) return 'good';
  if (winDrop < 20) return 'inaccuracy';
  if (winDrop < 30) return 'mistake';
  return 'blunder';
}

/** Analyse move i (positions[i] -> positions[i+1]) given evals of both positions. */
export function analyzeMove(before: Eval, after: Eval, moveLan: string, mover: 'w' | 'b'): MoveAnalysis {
  const wBefore = winChanceWhite(before);
  const wAfter = winChanceWhite(after);
  const [pb, pa] = mover === 'w' ? [wBefore, wAfter] : [100 - wBefore, 100 - wAfter];
  const winDrop = Math.max(0, pb - pa);
  return {
    classification: classify(winDrop, before.bestMove === moveLan),
    winDrop,
    accuracy: moveAccuracy(pb, pa),
  };
}

/** Average per-move accuracy for one player. */
export function playerAccuracy(moves: (MoveAnalysis | undefined)[], positions: Position[], color: 'w' | 'b'): number | null {
  const accs = moves.filter((m, i): m is MoveAnalysis => !!m && positions[i + 1]?.color === color).map((m) => m.accuracy);
  if (!accs.length) return null;
  return accs.reduce((a, b) => a + b, 0) / accs.length;
}

export function formatEval(e: Eval | undefined): string {
  if (!e) return '…';
  if (e.mate !== undefined) return e.mate === 0 ? '#' : `${e.mate > 0 ? '' : '-'}M${Math.abs(e.mate)}`;
  const v = (e.cp ?? 0) / 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
}
