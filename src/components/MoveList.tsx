import { useEffect, useRef } from 'react';
import type { Classification, MoveAnalysis, Position } from '../analysis';
import { TAGS } from '../tags';

const SYMBOL: Record<Classification, string> = {
  best: '★',
  good: '',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
};

interface Props {
  positions: Position[];
  moves: (MoveAnalysis | undefined)[];
  current: number;
  onSelect: (ply: number) => void;
}

export function MoveList({ positions, moves, current, onSelect }: Props) {
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  // Black may start (FEN games); pad so moves still line up in pairs.
  const blackFirst = positions[1]?.color === 'b';
  const plies = positions.slice(1).map((p, i) => ({ p, ply: i + 1, analysis: moves[i] }));
  const cells: (typeof plies[number] | null)[] = blackFirst ? [null, ...plies] : plies;
  const startNumber = Number(positions[0].fen.split(' ')[5] ?? 1);

  const rows = [];
  for (let i = 0; i < cells.length; i += 2) {
    rows.push(
      <div className="move-row" key={i}>
        <span className="move-number">{startNumber + i / 2}.</span>
        {[cells[i], cells[i + 1]].map((c, j) =>
          c ? (
            <button
              key={j}
              ref={c.ply === current ? activeRef : undefined}
              className={`move ${c.analysis?.classification ?? ''} ${c.ply === current ? 'active' : ''}`}
              onClick={() => onSelect(c.ply)}
              title={
                c.analysis
                  ? `${c.analysis.tag ? `${TAGS[c.analysis.tag].label} · ` : ''}${c.analysis.classification} (−${c.analysis.winDrop.toFixed(1)}%)`
                  : undefined
              }
            >
              {c.p.san}
              {c.analysis && c.analysis.tag !== 'beast' && (
                <span className="move-symbol">{SYMBOL[c.analysis.classification]}</span>
              )}
              {c.analysis?.tag && <span className="move-tag">{TAGS[c.analysis.tag].icon}</span>}
            </button>
          ) : (
            <span key={j} className="move empty">{j === 0 && blackFirst && i === 0 ? '…' : ''}</span>
          ),
        )}
      </div>,
    );
  }
  return <div className="move-list">{rows}</div>;
}
