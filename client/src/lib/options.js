export const OPTION_STYLES = [
  {
    letter: 'A',
    shape: 'triangle',
    name: 'Red triangle',
    base: 'bg-rose-600 text-white',
    hover: 'hover:bg-rose-500 active:bg-rose-700',
    bar: 'bg-rose-600',
  },
  {
    letter: 'B',
    shape: 'diamond',
    name: 'Blue diamond',
    base: 'bg-sky-600 text-white',
    hover: 'hover:bg-sky-500 active:bg-sky-700',
    bar: 'bg-sky-600',
  },
  {
    letter: 'C',
    shape: 'circle',
    name: 'Amber circle',
    base: 'bg-amber-500 text-slate-950',
    hover: 'hover:bg-amber-400 active:bg-amber-600',
    bar: 'bg-amber-500',
  },
  {
    letter: 'D',
    shape: 'square',
    name: 'Green square',
    base: 'bg-emerald-600 text-white',
    hover: 'hover:bg-emerald-500 active:bg-emerald-700',
    bar: 'bg-emerald-600',
  },
];

export function formatSeconds(ms) {
  return (ms / 1000).toFixed(1);
}

export function ordinal(rank) {
  if (!rank) return '-';
  const lastTwo = rank % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${rank}th`;
  return `${rank}${{ 1: 'st', 2: 'nd', 3: 'rd' }[rank % 10] ?? 'th'}`;
}
