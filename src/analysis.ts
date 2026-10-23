import { Chess, type Move, type Square } from 'chess.js';
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

/** Extra badge on top of the classification: exact engine move, or a mistake/blunder. */
export type Tag = 'beast' | 'donkey';

export interface MoveAnalysis {
  classification: Classification;
  /** Drop in win chance (0–100) for the side that moved. */
  winDrop: number;
  /** Lichess-style accuracy for this move (0–100). */
  accuracy: number;
  tag?: Tag;
}

export function parsePgn(pgn: string): { positions: Position[]; headers: Record<string, string> } {
  const chess = new Chess();
  chess.loadPgn(pgn);
  // chess.js fills unknown roster tags with "?"; drop those so the UI can use its own fallbacks.
  const headers = Object.fromEntries(
    Object.entries(chess.getHeaders() as Record<string, string>).filter(([, v]) => v && v !== '?'),
  );
  const history = chess.history({ verbose: true });
  const positions: Position[] = [{ fen: history.length ? history[0].before : chess.fen() }];
  for (const m of history) positions.push(toPosition(m));
  return { positions, headers };
}

export function toPosition(m: Move): Position {
  return { fen: m.after, san: m.san, lan: m.lan, from: m.from, to: m.to, color: m.color };
}

/** Play a dragged move if legal (auto-queen on promotion), or return null. */
export function tryMove(fen: string, from: string, to: string): Position | null {
  const chess = new Chess(fen);
  const piece = chess.get(from as Square);
  const promotion = piece?.type === 'p' && (to[1] === '8' || to[1] === '1') ? 'q' : undefined;
  try {
    return toPosition(chess.move({ from, to, promotion }));
  } catch {
    return null;
  }
}

/** Convert a UCI move ("g1f3") to SAN ("Nf3") in the given position. */
export function uciToSan(fen: string, uci: string): string {
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
  } catch {
    return uci;
  }
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

/** White's share for the eval bar / graph: like winChanceWhite, but a forced mate fills it completely. */
export function barPercent(e: Eval): number {
  if (e.mate !== undefined) return evalToCp(e) > 0 ? 100 : 0;
  return winChanceWhite(e);
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
  const isEngineMove = before.bestMove === moveLan;
  const classification = classify(winDrop, isEngineMove);
  const tag: Tag | undefined = isEngineMove
    ? 'beast'
    : classification === 'mistake' || classification === 'blunder'
      ? 'donkey'
      : undefined;
  return { classification, winDrop, accuracy: moveAccuracy(pb, pa), tag };
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
