import { useEffect, useRef, useState } from 'react';
import { fromEngine, terminalEval, type Eval } from './analysis';
import { Engine, type EngineResult } from './engine';

export interface LiveEval {
  fen: string;
  eval: Eval;
  depth: number;
}

/** Continuously evaluate `fen` on a dedicated engine, restarting whenever it changes. */
export function useLiveEval(fen: string | null, depth: number): LiveEval | null {
  const engineRef = useRef<Engine | null>(null);
  const [result, setResult] = useState<LiveEval | null>(null);

  useEffect(
    () => () => {
      engineRef.current?.terminate();
      engineRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!fen) return;
    const terminal = terminalEval(fen);
    if (terminal) {
      setResult({ fen, eval: terminal, depth: 0 });
      return;
    }
    const engine = (engineRef.current ??= new Engine());
    const controller = new AbortController();
    // Cut the previous search short so the new position starts right away.
    engine.stop();
    const update = (r: EngineResult) => {
      if (!controller.signal.aborted && r.depth > 0) setResult({ fen, eval: fromEngine(r), depth: r.depth });
    };
    engine.analyze(fen, depth, { onUpdate: update, signal: controller.signal }).then(update);
    return () => controller.abort();
  }, [fen, depth]);

  return result?.fen === fen ? result : null;
}
