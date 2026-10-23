// Thin UCI wrapper around the Stockfish WASM build running in a Web Worker.

export interface EngineResult {
  /** Centipawns from White's point of view (undefined if mate). */
  cp?: number;
  /** Moves to mate from White's point of view: >0 White mates, <0 Black mates. */
  mate?: number;
  /** Best move in UCI notation, e.g. "e2e4". */
  bestMove?: string;
  depth: number;
}

export interface AnalyzeOptions {
  /** Called on every completed search depth with the result so far. */
  onUpdate?: (result: EngineResult) => void;
  /** If aborted before the job starts, it is skipped (resolves with an empty result). */
  signal?: AbortSignal;
}

export class Engine {
  private worker: Worker;
  private ready: Promise<void>;
  private listener: ((line: string) => void) | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(path = '/stockfish/stockfish.js') {
    this.worker = new Worker(path);
    this.worker.onmessage = (e: MessageEvent) => this.listener?.(String(e.data));
    this.ready = this.waitFor('uciok', () => this.worker.postMessage('uci')).then(() =>
      this.waitFor('readyok', () => this.worker.postMessage('isready')),
    );
  }

  private waitFor(token: string, send: () => void): Promise<void> {
    return new Promise((resolve) => {
      this.listener = (line) => {
        if (line.startsWith(token)) resolve();
      };
      send();
    });
  }

  /** Analyse a position. Calls are serialized, so it is safe to fire many at once. */
  analyze(fen: string, depth: number, { onUpdate, signal }: AnalyzeOptions = {}): Promise<EngineResult> {
    const run = async () => {
      await this.ready;
      if (signal?.aborted) return { depth: 0 };
      const whiteToMove = fen.split(' ')[1] === 'w';
      const sign = whiteToMove ? 1 : -1;
      return new Promise<EngineResult>((resolve) => {
        const result: EngineResult = { depth: 0 };
        this.listener = (line) => {
          if (line.startsWith('info') && line.includes(' score ') && !line.includes('bound')) {
            const d = /\bdepth (\d+)/.exec(line);
            const cp = /\bscore cp (-?\d+)/.exec(line);
            const mate = /\bscore mate (-?\d+)/.exec(line);
            const pv = /\bpv (\S+)/.exec(line);
            if (d) result.depth = Number(d[1]);
            if (cp) {
              result.cp = sign * Number(cp[1]);
              result.mate = undefined;
            } else if (mate) {
              result.mate = sign * Number(mate[1]);
              result.cp = undefined;
            }
            if (pv) result.bestMove = pv[1];
            onUpdate?.({ ...result });
          } else if (line.startsWith('bestmove')) {
            const move = line.split(' ')[1];
            if (move && move !== '(none)') result.bestMove = move;
            resolve(result);
          }
        };
        this.worker.postMessage(`position fen ${fen}`);
        this.worker.postMessage(`go depth ${depth}`);
      });
    };
    const job = this.queue.then(run);
    this.queue = job.catch(() => undefined);
    return job;
  }

  /** End the running search early; its promise resolves with the best result so far. */
  stop() {
    this.worker.postMessage('stop');
  }

  /** Kill the worker; pending jobs never resolve. */
  terminate() {
    this.worker.terminate();
  }
}
