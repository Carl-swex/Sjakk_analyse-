import { barPercent, formatEval, type Eval } from '../analysis';

export function EvalBar({ evaluation, flipped }: { evaluation?: Eval; flipped: boolean }) {
  const white = evaluation ? barPercent(evaluation) : 50;
  const whiteAhead = white >= 50;
  return (
    <div className={`eval-bar${flipped ? ' flipped' : ''}`}>
      <div className="eval-bar-white" style={{ height: `${white}%` }} />
      <span className={`eval-bar-label ${whiteAhead ? 'bottom' : 'top'}`}>{formatEval(evaluation)}</span>
    </div>
  );
}
