import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import {
  analyzeMove,
  formatEval,
  fromEngine,
  parsePgn,
  playerAccuracy,
  terminalEval,
  type Eval,
  type Position,
} from './analysis';
import { Engine } from './engine';
import { EvalBar } from './components/EvalBar';
import { EvalGraph } from './components/EvalGraph';
import { MoveList } from './components/MoveList';

const DEPTH = 16;

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

export default function App() {
  const [pgn, setPgn] = useState(SAMPLE_PGN);
  const [positions, setPositions] = useState<Position[]>([]);
  const [headers, setHeaders] = useState<Record<string, string>>({});
  const [evals, setEvals] = useState<(Eval | undefined)[]>([]);
  const [current, setCurrent] = useState(0);
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      const step: Record<string, (c: number) => number> = {
        ArrowLeft: (c) => c - 1,
        ArrowRight: (c) => c + 1,
        ArrowUp: () => 0,
        Home: () => 0,
        ArrowDown: () => last,
        End: () => last,
      };
      if (e.key === 'f') setFlipped((f) => !f);
      const fn = step[e.key];
      if (!fn) return;
      e.preventDefault();
      setCurrent((c) => Math.max(0, Math.min(last, fn(c))));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last]);

  const pos = positions[current];
  const currentEval = evals[current];
  const currentMove = current > 0 ? moves[current - 1] : undefined;

  const arrows =
    currentEval?.bestMove && current < last
      ? [{ startSquare: currentEval.bestMove.slice(0, 2), endSquare: currentEval.bestMove.slice(2, 4), color: 'rgba(0, 120, 255, 0.7)' }]
      : [];
  const squareStyles: Record<string, React.CSSProperties> =
    pos?.from && pos.to
      ? { [pos.from]: { background: 'rgba(255, 220, 0, 0.4)' }, [pos.to]: { background: 'rgba(255, 220, 0, 0.4)' } }
      : {};

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
              <EvalBar evaluation={currentEval} flipped={flipped} />
              <div className="board">
                <Chessboard
                  options={{
                    id: 'analysis-board',
                    position: pos.fen,
                    boardOrientation: flipped ? 'black' : 'white',
                    allowDragging: false,
                    allowDrawingArrows: false,
                    arrows,
                    squareStyles,
                  }}
                />
              </div>
            </div>
            <PlayerLine name={headers[flipped ? 'Black' : 'White'] ?? (flipped ? 'Svart' : 'Hvit')} acc={flipped ? blackAcc : whiteAcc} />
            <div className="nav">
              <button onClick={() => setCurrent(0)}>⏮</button>
              <button onClick={() => setCurrent((c) => Math.max(0, c - 1))}>◀</button>
              <button onClick={() => setCurrent((c) => Math.min(last, c + 1))}>▶</button>
              <button onClick={() => setCurrent(last)}>⏭</button>
              <button onClick={() => setFlipped((f) => !f)} title="Snu brettet (F)">⇅</button>
            </div>
          </div>

          <div className="side-column">
            <div className="current-info">
              <strong>{formatEval(currentEval)}</strong>
              {pos.san && <span> etter {pos.san}</span>}
              {currentMove && (
                <span className={`badge ${currentMove.classification}`}>
                  {LABELS[currentMove.classification]}
                  {currentMove.winDrop >= 2 && ` (−${currentMove.winDrop.toFixed(1)}%)`}
                </span>
              )}
              {currentEval?.bestMove && current < last && <div className="best-move">Beste: {currentEval.bestMove}</div>}
            </div>
            <MoveList positions={positions} moves={moves} current={current} onSelect={setCurrent} />
            <EvalGraph evals={evals} moves={moves} current={current} onSelect={setCurrent} />
            <p className="hint">← → navigerer · ↑ ↓ start/slutt · F snur brettet</p>
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
