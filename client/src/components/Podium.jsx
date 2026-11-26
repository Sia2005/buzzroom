const PLACES = [
  { rank: 2, height: 'h-28', tone: 'bg-slate-300 text-slate-900', order: 'order-1' },
  { rank: 1, height: 'h-40', tone: 'bg-yellow-400 text-slate-950', order: 'order-2' },
  { rank: 3, height: 'h-20', tone: 'bg-amber-700 text-white', order: 'order-3' },
];

export function Podium({ podium, size = 'md' }) {
  if (!podium?.length)
    return <p className="text-center text-slate-500">Nobody played this round.</p>;

  const large = size === 'lg';
  return (
    <div className="flex items-end justify-center gap-3 sm:gap-6">
      {PLACES.map(({ rank, height, tone, order }) => {
        const player = podium[rank - 1];
        if (!player) return null;
        return (
          <div key={rank} className={`flex w-28 flex-col items-center gap-2 sm:w-44 ${order}`}>
            <p
              className={`w-full truncate text-center font-bold text-slate-900 ${large ? 'text-2xl' : 'text-base'}`}
            >
              {player.nickname}
            </p>
            <p
              className={`font-semibold tabular-nums text-slate-600 ${large ? 'text-xl' : 'text-sm'}`}
            >
              {player.score.toLocaleString()}
            </p>
            <div
              className={`flex w-full items-start justify-center rounded-t-2xl pt-3 font-black ${height} ${tone} ${large ? 'text-5xl' : 'text-3xl'}`}
            >
              {rank}
            </div>
          </div>
        );
      })}
    </div>
  );
}
