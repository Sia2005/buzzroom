export function Leaderboard({ entries, highlight, size = 'md' }) {
  if (!entries?.length) {
    return <p className="text-center text-slate-500">No scores yet.</p>;
  }

  const large = size === 'lg';
  return (
    <ol className={`flex flex-col ${large ? 'gap-3' : 'gap-2'}`}>
      {entries.map((entry, index) => {
        const isMe = highlight && entry.nickname === highlight;
        return (
          <li
            key={`${entry.nickname}-${index}`}
            className={`flex items-center gap-4 rounded-2xl px-5 ${large ? 'py-4 text-3xl' : 'py-3 text-lg'} ${isMe ? 'bg-yellow-300 text-slate-950' : 'bg-white text-slate-900 ring-1 ring-slate-200'}`}
          >
            <span className={`w-10 font-black tabular-nums ${isMe ? '' : 'text-slate-400'}`}>
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold">{entry.nickname}</span>
            <span className="font-black tabular-nums">{entry.score.toLocaleString()}</span>
          </li>
        );
      })}
    </ol>
  );
}
