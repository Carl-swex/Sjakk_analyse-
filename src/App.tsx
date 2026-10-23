import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import {
  analyzeMove,
  formatEval,
  fromEngine,
  parsePgn,
  playerAccuracy,
  terminalEval,
  tryMove,
  uciToSan,
  type Eval,
  type Position,
  type Tag,
} from './analysis';
import { Engine } from './engine';
import { EvalBar } from './components/EvalBar';
import { EvalGraph } from './components/EvalGraph';
import { MoveList } from './components/MoveList';
import { TAGS } from './tags';
import { useLiveEval } from './useLiveEval';

const DEPTH = 16;
const LIVE_DEPTH = 18;

const SAMPLE_PGN = `[Event "Paris Opera"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7
8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7
14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

const LABELS = {
  best: 'Beste',
  good: 'Bra',
  inaccuracy: 'Unøyaktighet',
  mistake: 'Feil',
  blunder: 'Blunder',
} as const;

/** A sideline explored by dragging pieces. positions[0] is the game position at `base`. */
interface Variation {
  base: number;
  positions: Position[];
  index: number;
}

/** "12." before a White move, "12..." before a Black move that starts a line. */
function moveNumber(before: Position, first: boolean): string {
  const [, turn, , , , full] = before.fen.split(' ');
  if (turn === 'w') return `${full}. `;
  return first ? `${full}... ` : '';
}

export default function App() {
  const [pgn, setPgn] = useState(SAMPLE_PGN);
  const [positions, setPositions] = useState<Position[]>([]);
  const [headers, setHeaders] = useState<Record<string, string>>({});
  const [evals, setEvals] = useState<(Eval | undefined)[]>([]);
  const [current, setCurrent] = useState(0);
  const [variation, setVariation] = useState<Variation | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const engineRef = useRef<Engine | null>(null);

  useEffect(() => () => engineRef.current?.terminate(), []);

  const analyze = useCallback(async () => {
    let parsed;
    try {
      parsed = parsePgn(pgn);
    } catch (e) {
      setError(`Kunne ikke lese PGN: ${(e as Error).message}`);
      return;
    }
    setError(null);
    setPositions(parsed.positions);
    setHeaders(parsed.headers);
    setEvals(new Array(parsed.positions.length).fill(undefined));
    setCurrent(0);
    setVariation(null);

    // Fresh engine per run: terminating the old one cancels any in-flight analysis.
    engineRef.current?.terminate();
    const engine = new Engine();
    engineRef.current = engine;

    for (let i = 0; i < parsed.positions.length; i++) {
      const fen = parsed.positions[i].fen;
      const result = terminalEval(fen) ?? fromEngine(await engine.analyze(fen, DEPTH));
      if (engineRef.current !== engine) return;
      setEvals((prev) => {
        const next = prev.slice();
        next[i] = result;
        return next;
      });
    }
  }, [pgn]);

  const moves = useMemo(
    () =>
      positions.slice(1).map((p, i) => {
        const before = evals[i];
        const after = evals[i + 1];
        return before && after && p.lan && p.color ? analyzeMove(before, after, p.lan, p.color) : undefined;
      }),
    [positions, evals],
  );

  const last = positions.length - 1;
  const done = evals.filter(Boolean).length;
  const analyzing = positions.length > 0 && done < positions.length;
  const inSideline = variation !== null && variation.index > 0;

  const selectMain = useCallback((ply: number) => {
    setVariation(null);
    setCurrent(ply);
  }, []);

  const backToGame = useCallback(() => {
    if (variation) setCurrent(variation.base);
    setVariation(null);
  }, [variation]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === 'f') setFlipped((f) => !f);
      if (e.key === 'Escape') backToGame();

      if (variation) {
        const end = variation.positions.length - 1;
        const step: Record<string, (i: number) => number> = {
          ArrowLeft: (i) => i - 1,
          ArrowRight: (i) => i + 1,
          ArrowUp: () => 0,
          Home: () => 0,
          ArrowDown: () => end,
          End: () => end,
        };
        const fn = step[e.key];
        if (!fn) return;
        e.preventDefault();
        const next = fn(variation.index);
        // Stepping back past the start of the sideline returns to the game.
        if (next < 0) backToGame();
        else setVariation({ ...variation, index: Math.min(end, next) });
        return;
      }

      const step: Record<string, (c: number) => number> = {
        ArrowLeft: (c) => c - 1,
        ArrowRight: (c) => c + 1,
        ArrowUp: () => 0,
        Home: () => 0,
        ArrowDown: () => last,
        End: () => last,
      };
      const fn = step[e.key];
      if (!fn) return;
      e.preventDefault();
      setCurrent((c) => Math.max(0, Math.min(last, fn(c))));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last, variation, backToGame]);

  const pos = variation ? variation.positions[variation.index] : positions[current];

  // Positions off the game line have no stored eval, so a second engine evaluates them live.
  const live = useLiveEval(inSideline ? pos.fen : null, LIVE_DEPTH);
  const mainPly = variation ? variation.base : current;
  const shownEval = inSideline ? live?.eval : evals[mainPly];
  const currentMove = !inSideline && mainPly > 0 ? moves[mainPly - 1] : undefined;

  const onPieceDrop = ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
    if (!pos || !targetSquare) return false;
    const next = tryMove(pos.fen, sourceSquare, targetSquare);
    if (!next) return false;

    if (!inSideline && positions[mainPly + 1]?.lan === next.lan) {
      // Played the game move: just follow the game.
      selectMain(mainPly + 1);
    } else if (!variation) {
      setVariation({ base: current, positions: [positions[current], next], index: 1 });
    } else if (variation.positions[variation.index + 1]?.lan === next.lan) {
      setVariation({ ...variation, index: variation.index + 1 });
    } else {
      // Branching from the middle of the sideline replaces everything after it.
      setVariation({ ...variation, positions: [...variation.positions.slice(0, variation.index + 1), next], index: variation.index + 1 });
    }
    return true;
  };

  const sideToMove = pos?.fen.split(' ')[1];
  const bestMove = shownEval?.bestMove;
  const arrows = bestMove
    ? [{ startSquare: bestMove.slice(0, 2), endSquare: bestMove.slice(2, 4), color: 'rgba(0, 120, 255, 0.7)' }]
    : [];
  const highlight: React.CSSProperties = { background: 'rgba(255, 220, 0, 0.4)' };
  const squareStyles: Record<string, React.CSSProperties> =
    pos?.from && pos.to ? { [pos.from]: highlight, [pos.to]: highlight } : {};
  const badge: { square: string; tag: Tag } | null =
    currentMove?.tag && pos?.to ? { square: pos.to, tag: currentMove.tag } : null;

  const whiteAcc = playerAccuracy(moves, positions, 'w');
  const blackAcc = playerAccuracy(moves, positions, 'b');

  return (
    <div className="app">
      <header>
        <h1>Sjakkanalyse</h1>
      </header>

      <section className="input">
        <textarea value={pgn} onChange={(e) => setPgn(e.target.value)} placeholder="Lim inn PGN her…" rows={6} />
        <div className="input-actions">
          <button onClick={analyze}>Analyser</button>
          {analyzing && (
            <span className="progress">
              Analyserer {done}/{positions.length} (dybde {DEPTH})…
            </span>
          )}
          {error && <span className="error">{error}</span>}
        </div>
      </section>

      {pos && (
        <main className="analysis">
          <div className="board-column">
            <PlayerLine name={headers[flipped ? 'White' : 'Black'] ?? (flipped ? 'Hvit' : 'Svart')} acc={flipped ? whiteAcc : blackAcc} />
            <div className="board-wrap">
              <EvalBar evaluation={shownEval} flipped={flipped} />
              <div className="board">
                <Chessboard
                  options={{
                    id: 'analysis-board',
                    position: pos.fen,
                    boardOrientation: flipped ? 'black' : 'white',
                    allowDragging: true,
                    allowDrawingArrows: false,
                    canDragPiece: ({ piece }) => piece.pieceType[0] === sideToMove,
                    onPieceDrop,
                    arrows,
                    squareStyles,
                    squareRenderer: ({ square, children }) => (
                      <div style={{ width: '100%', height: '100%', position: 'relative', ...squareStyles[square] }}>
                        {children}
                        {badge?.square === square && (
                          <span className={`square-badge ${badge.tag}`} title={TAGS[badge.tag].label}>
                            {TAGS[badge.tag].icon}
                          </span>
                        )}
                      </div>
                    ),
                  }}
                />
              </div>
            </div>
            <PlayerLine name={headers[flipped ? 'Black' : 'White'] ?? (flipped ? 'Svart' : 'Hvit')} acc={flipped ? blackAcc : whiteAcc} />
            <div className="nav">
              <button onClick={() => selectMain(0)}>⏮</button>
              <button onClick={() => selectMain(Math.max(0, mainPly - 1))}>◀</button>
              <button onClick={() => selectMain(Math.min(last, mainPly + 1))}>▶</button>
              <button onClick={() => selectMain(last)}>⏭</button>
              <button onClick={() => setFlipped((f) => !f)} title="Snu brettet (F)">⇅</button>
            </div>
          </div>

          <div className="side-column">
            <div className="current-info">
              <strong>{formatEval(shownEval)}</strong>
              {pos.san && <span> etter {pos.san}</span>}
              {currentMove && (
                <span className={`badge ${currentMove.classification}`}>
                  {LABELS[currentMove.classification]}
                  {currentMove.winDrop >= 2 && ` (−${currentMove.winDrop.toFixed(1)}%)`}
                </span>
              )}
              {currentMove?.tag && (
                <span className={`badge tag-${currentMove.tag}`}>
                  {TAGS[currentMove.tag].icon} {TAGS[currentMove.tag].label}
                </span>
              )}
              {bestMove && (
                <div className="best-move">
                  Beste: {uciToSan(pos.fen, bestMove)}
                  {inSideline && live && <span> · dybde {live.depth}</span>}
                </div>
              )}
            </div>

            {variation && (
              <div className="variation">
                <div className="variation-header">
                  <span>Variant</span>
                  <button onClick={backToGame} title="Esc">
                    ↩ Tilbake til partiet
                  </button>
                </div>
                <div className="variation-moves">
                  {variation.positions.slice(1).map((p, i) => (
                    <button
                      key={i}
                      className={`move ${i + 1 === variation.index ? 'active' : ''}`}
                      onClick={() => setVariation({ ...variation, index: i + 1 })}
                    >
                      {moveNumber(variation.positions[i], i === 0)}
                      {p.san}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <MoveList positions={positions} moves={moves} current={mainPly} onSelect={selectMain} />
            <EvalGraph evals={evals} moves={moves} current={mainPly} onSelect={selectMain} />
            <p className="hint">Dra brikker for å utforske · ← → navigerer · ↑ ↓ start/slutt · Esc tilbake · F snur brettet</p>
          </div>
        </main>
      )}
    </div>
  );
}

function PlayerLine({ name, acc }: { name: string; acc: number | null }) {
  return (
    <div className="player-line">
      <span>{name}</span>
      {acc !== null && <span className="accuracy">Accuracy {acc.toFixed(1)}%</span>}
    </div>
  );
}
