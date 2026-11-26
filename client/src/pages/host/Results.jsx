import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getResult } from '../../api/quizzes.js';
import { OptionShape } from '../../components/OptionShape.jsx';
import { Podium } from '../../components/Podium.jsx';
import { Card, FullScreenMessage, LinkButton, LoadingScreen, Logo } from '../../components/ui.jsx';
import { OPTION_STYLES, formatSeconds } from '../../lib/options.js';

export default function Results() {
  const { id } = useParams();
  const [state, setState] = useState({ status: 'loading', result: null, error: '' });

  useEffect(() => {
    const controller = new AbortController();
    getResult(id, { signal: controller.signal })
      .then((result) => setState({ status: 'ready', result, error: '' }))
      .catch((error) => {
        if (error.name === 'AbortError') return;
        setState({ status: 'error', result: null, error: error.message });
      });
    return () => controller.abort();
  }, [id]);

  if (state.status === 'loading') return <LoadingScreen label="Loading results" />;
  if (state.status === 'error') {
    return (
      <FullScreenMessage
        title="Results unavailable"
        action={<LinkButton to="/host">Create a quiz</LinkButton>}
      >
        {state.error}
      </FullScreenMessage>
    );
  }

  const { result } = state;
  const playedAt = new Date(result.playedAt).toLocaleString();

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Logo to="/host" />
        <LinkButton to="/host" size="sm" variant="secondary">
          New quiz
        </LinkButton>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 pb-16">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{result.quizTitle}</h1>
          <p className="mt-1 text-slate-600">
            Room {result.roomCode} · {playedAt} · {result.players.length}{' '}
            {result.players.length === 1 ? 'player' : 'players'}
          </p>
        </div>

        <Card>
          <Podium podium={result.players.slice(0, 3)} />
        </Card>

        <Card padded={false} className="overflow-x-auto pb-2">
          <h2 className="px-6 pt-6 text-lg font-semibold text-slate-900">Final ranking</h2>
          {result.players.length === 0 ? (
            <p className="px-6 py-6 text-slate-500">No players took part.</p>
          ) : (
            <table className="mt-4 w-full text-left">
              <thead className="border-y border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3">Rank</th>
                  <th className="px-6 py-3">Player</th>
                  <th className="px-6 py-3 text-right">Correct</th>
                  <th className="px-6 py-3 text-right">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.players.map((player) => (
                  <tr key={`${player.rank}-${player.nickname}`}>
                    <td className="px-6 py-3 font-bold tabular-nums">{player.rank}</td>
                    <td className="px-6 py-3 font-medium">{player.nickname}</td>
                    <td className="px-6 py-3 text-right tabular-nums">
                      {player.correctCount} / {result.perQuestion.length}
                    </td>
                    <td className="px-6 py-3 text-right font-semibold tabular-nums">
                      {player.score.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card padded={false} className="overflow-x-auto pb-2">
          <h2 className="px-6 pt-6 text-lg font-semibold text-slate-900">Question breakdown</h2>
          <table className="mt-4 w-full min-w-[640px] text-left">
            <thead className="border-y border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3">#</th>
                <th className="px-6 py-3">Question</th>
                <th className="px-6 py-3 text-right">Correct</th>
                <th className="px-6 py-3 text-right">Avg time</th>
                <th className="px-6 py-3">Answers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.perQuestion.map((stats) => {
                const hardest = stats.index === result.hardestIndex;
                return (
                  <tr key={stats.index} className={hardest ? 'bg-rose-50' : ''}>
                    <td className="px-6 py-3 align-top font-bold tabular-nums">
                      {stats.index + 1}
                    </td>
                    <td className="px-6 py-3 align-top">
                      <p className="font-medium text-slate-900">{stats.text}</p>
                      {stats.correctIndex !== null && (
                        <p className="text-sm text-slate-500">
                          Answer: {stats.options[stats.correctIndex]}
                        </p>
                      )}
                      {hardest && (
                        <span className="mt-1 inline-block rounded-md bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">
                          Hardest question
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right align-top font-semibold tabular-nums">
                      {stats.correctPct}%
                    </td>
                    <td className="px-6 py-3 text-right align-top tabular-nums">
                      {formatSeconds(stats.avgElapsedMs)}s
                    </td>
                    <td className="px-6 py-3 align-top">
                      <div className="flex gap-3">
                        {stats.answerCounts.map((count, index) => (
                          <span
                            key={index}
                            className={`flex items-center gap-1 text-sm tabular-nums ${index === stats.correctIndex ? 'font-bold text-emerald-700' : 'text-slate-600'}`}
                          >
                            <OptionShape shape={OPTION_STYLES[index].shape} className="h-3 w-3" />
                            {count}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </main>
    </div>
  );
}
