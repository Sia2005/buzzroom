import { OPTION_STYLES } from '../lib/options.js';
import { OptionShape } from './OptionShape.jsx';

const SIZES = {
  player: { box: 'min-h-28 p-4 text-lg', shape: 'h-8 w-8', letter: 'text-base' },
  host: { box: 'min-h-24 p-6 text-3xl', shape: 'h-10 w-10', letter: 'text-2xl' },
};

const STATUS_CLASSES = {
  idle: '',
  selected: 'ring-4 ring-slate-900 ring-offset-2',
  correct: 'ring-4 ring-emerald-400 ring-offset-2',
  dimmed: 'opacity-30',
};

export function OptionButton({ index, text, onClick, disabled, status = 'idle', size = 'player' }) {
  const style = OPTION_STYLES[index];
  const sizing = SIZES[size];
  const interactive = Boolean(onClick) && !disabled;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      aria-label={`Option ${style.letter}, ${style.name}: ${text}`}
      className={`flex w-full items-center gap-4 rounded-2xl text-left font-semibold shadow-sm transition ${style.base} ${interactive ? `${style.hover} cursor-pointer` : 'cursor-default'} ${sizing.box} ${STATUS_CLASSES[status]}`}
    >
      <span className="flex shrink-0 flex-col items-center gap-1">
        <OptionShape shape={style.shape} className={sizing.shape} />
        <span className={`font-black ${sizing.letter}`}>{style.letter}</span>
      </span>
      <span className="min-w-0 flex-1 break-words leading-snug">{text}</span>
      {status === 'correct' && (
        <span className="shrink-0 rounded-full bg-white/90 px-3 py-1 text-sm font-bold text-emerald-700">
          Correct
        </span>
      )}
    </button>
  );
}
