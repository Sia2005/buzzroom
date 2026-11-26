import { OPTION_STYLES } from '../lib/options.js';
import { OptionShape } from './OptionShape.jsx';

export function AnswerDistribution({ answerCounts, correctIndex }) {
  const max = Math.max(1, ...answerCounts);
  return (
    <div className="flex h-56 items-end justify-center gap-6" aria-label="Answer distribution">
      {answerCounts.map((count, index) => {
        const style = OPTION_STYLES[index];
        const isCorrect = index === correctIndex;
        return (
          <div key={style.letter} className="flex w-24 flex-col items-center gap-2">
            <span className="text-3xl font-black tabular-nums text-slate-900">{count}</span>
            <div
              className={`w-full rounded-t-xl ${style.bar} ${isCorrect ? '' : 'opacity-40'}`}
              style={{ height: `${Math.max(6, (count / max) * 140)}px` }}
            />
            <span
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-lg font-bold ${isCorrect ? 'bg-emerald-100 text-emerald-800' : 'text-slate-500'}`}
            >
              <OptionShape shape={style.shape} className="h-4 w-4" />
              {style.letter}
            </span>
          </div>
        );
      })}
    </div>
  );
}
