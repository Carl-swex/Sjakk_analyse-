import { barPercent, type Eval, type MoveAnalysis } from '../analysis';

const W = 600;
const H = 120;

interface Props {
  evals: (Eval | undefined)[];
  moves: (MoveAnalysis | undefined)[];
  current: number;
  onSelect: (ply: number) => void;
}

export function EvalGraph({ evals, moves, current, onSelect }: Props) {
  const n = evals.length;
  if (n < 2) return null;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (e: Eval | undefined) => H - ((e ? barPercent(e) : 50) / 100) * H;

  const points = evals.map((e, i) => `${x(i)},${y(e)}`).join(' ');
  const area = `0,${H} ${points} ${W},${H}`;

  const handleClick = (ev: React.MouseEvent<SVGSVGElement>) => {
    const rect = ev.currentTarget.getBoundingClientRect();
    const ply = Math.round(((ev.clientX - rect.left) / rect.width) * (n - 1));
    onSelect(Math.max(0, Math.min(n - 1, ply)));
  };

  return (
    <svg className="eval-graph" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onClick={handleClick}>
      <rect width={W} height={H} className="graph-bg" />
      <polygon points={area} className="graph-area" />
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="graph-mid" />
      <line x1={x(current)} x2={x(current)} y1={0} y2={H} className="graph-cursor" />
      {moves.map((m, i) =>
        m && (m.classification === 'mistake' || m.classification === 'blunder' || m.classification === 'inaccuracy') ? (
          <circle key={i} cx={x(i + 1)} cy={y(evals[i + 1])} r={3.5} className={`graph-dot ${m.classification}`} />
        ) : null,
      )}
    </svg>
  );
}
