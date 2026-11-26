import { useCallback, useReducer } from 'react';
import { useParams } from 'react-router-dom';
import { ConnectionBanner } from '../../components/ConnectionBanner.jsx';
import { Countdown } from '../../components/Countdown.jsx';
import { Leaderboard } from '../../components/Leaderboard.jsx';
import { OptionButton } from '../../components/OptionButton.jsx';
import { OptionShape } from '../../components/OptionShape.jsx';
import { Podium } from '../../components/Podium.jsx';
import {
  ErrorMessage,
  FullScreenMessage,
  LinkButton,
  LoadingScreen,
} from '../../components/ui.jsx';
import { request, useSocket, useSocketEvent } from '../../hooks/useSocket.js';
import { OPTION_STYLES, ordinal } from '../../lib/options.js';
import { clearSession, loadSession } from '../../lib/session.js';

function createInitialState() {
  return {
    phase: null,
    question: null,
    selected: null,
    answered: false,
    timeUp: false,
    answerError: '',
    correctIndex: null,
    result: null,
    me: { nickname: loadSession('player')?.nickname ?? '', score: 0, rank: null },
    leaderboard: null,
    over: null,
    hostOnline: true,
    lobbyCount: 0,
  };
}

function reducer(current, action) {
  const { payload } = action;
  switch (action.type) {
    case 'snapshot':
      return {
        ...current,
        phase: payload.state,
        question: payload.question,
        selected: null,
        answered: Boolean(payload.me?.answered),
        timeUp: false,
        answerError: '',
        correctIndex: payload.reveal?.correctIndex ?? null,
        result: payload.me?.lastResult ?? null,
        me: {
          nickname: payload.me?.nickname ?? current.me.nickname,
          score: payload.me?.score ?? 0,
          rank: payload.me?.rank ?? null,
        },
        leaderboard: payload.leaderboard,
        hostOnline: payload.hostOnline,
        lobbyCount: payload.lobby?.count ?? current.lobbyCount,
      };
    case 'question:show':
      return {
        ...current,
        phase: 'QUESTION',
        question: payload,
        selected: null,
        answered: false,
        timeUp: false,
        answerError: '',
        correctIndex: null,
        result: null,
      };
    case 'answer:sent':
      return { ...current, selected: payload, answered: true, answerError: '' };
    case 'answer:rejected':
      return { ...current, answered: payload.keepLocked, answerError: payload.message };
    case 'time:up':
      return { ...current, timeUp: true };
    case 'question:end':
      return { ...current, phase: 'REVEAL', correctIndex: payload.correctIndex };
    case 'answer:result':
      return {
        ...current,
        result: payload,
        me: { ...current.me, score: payload.totalScore, rank: payload.rank },
      };
    case 'leaderboard:update':
      return { ...current, phase: 'LEADERBOARD', leaderboard: payload };
    case 'game:over':
      return { ...current, phase: 'ENDED', over: payload };
    case 'host:status':
      return { ...current, hostOnline: payload.online };
    case 'lobby:update':
      return { ...current, lobbyCount: payload.count };
    default:
      return current;
  }
}

function ResultCard({ result, me }) {
  if (!result) {
    return <p className="text-center text-lg text-slate-300">Checking answers...</p>;
  }

  const headline = !result.answered ? 'No answer' : result.correct ? 'Correct' : 'Incorrect';
  const tone = result.correct ? 'bg-emerald-500' : result.answered ? 'bg-rose-600' : 'bg-slate-600';

  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-3xl p-8 text-center text-white ${tone}`}
    >
      <p className="text-4xl font-black">{headline}</p>
      <p className="text-2xl font-bold tabular-nums">+{result.points.toLocaleString()}</p>
      {result.bonus > 0 && (
        <p className="rounded-full bg-white/20 px-3 py-1 text-sm font-semibold">
          Includes {result.bonus} streak bonus ({result.streak} in a row)
        </p>
      )}
      <div className="mt-2 grid w-full grid-cols-2 gap-3">
        <div className="rounded-2xl bg-black/15 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Score</p>
          <p className="text-2xl font-black tabular-nums">{me.score.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl bg-black/15 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Rank</p>
          <p className="text-2xl font-black tabular-nums">
            {ordinal(me.rank)}
            <span className="text-base font-semibold opacity-80"> of {result.playerCount}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function LockedIn({ choice }) {
  const style = choice === null ? null : OPTION_STYLES[choice];
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      {style && (
        <span className={`flex h-24 w-24 items-center justify-center rounded-3xl ${style.base}`}>
          <OptionShape shape={style.shape} className="h-12 w-12" />
        </span>
      )}
      <p className="text-2xl font-bold">Answer locked in</p>
      <p className="text-slate-400">Waiting for the others...</p>
    </div>
  );
}

export default function PlayerGame() {
  const { code } = useParams();
  const [game, dispatch] = useReducer(reducer, undefined, createInitialState);

  const { status, rejoinError, restoring } = useSocket({
    role: 'player',
    code,
    onSnapshot: (payload) => dispatch({ type: 'snapshot', payload }),
  });

  const forward = (type) => (payload) => dispatch({ type, payload });
  useSocketEvent('question:show', forward('question:show'));
  useSocketEvent('question:end', forward('question:end'));
  useSocketEvent('answer:result', forward('answer:result'));
  useSocketEvent('leaderboard:update', forward('leaderboard:update'));
  useSocketEvent('host:status', forward('host:status'));
  useSocketEvent('lobby:update', forward('lobby:update'));
  useSocketEvent('game:over', (payload) => {
    clearSession('player');
    dispatch({ type: 'game:over', payload });
  });

  const handleExpire = useCallback(() => dispatch({ type: 'time:up' }), []);

  async function answer(choice) {
    if (game.answered || game.timeUp || !game.question) return;
    dispatch({ type: 'answer:sent', payload: choice });
    const response = await request('player:answer', {
      code,
      questionIndex: game.question.index,
      choice,
    });
    if (response.ok) return;
    dispatch({
      type: 'answer:rejected',
      payload: {
        message: response.error.message,
        keepLocked: response.error.code === 'ALREADY_ANSWERED',
      },
    });
  }

  if (rejoinError && game.phase !== 'ENDED') {
    return (
      <FullScreenMessage
        title="Can't rejoin this game"
        action={<LinkButton to="/">Join another game</LinkButton>}
      >
        {rejoinError.message}
      </FullScreenMessage>
    );
  }

  if (restoring || !game.phase) return <LoadingScreen label="Joining room" />;

  const { phase, question, me } = game;
  const myFinal = game.over?.ranking.find((entry) => entry.nickname === me.nickname);

  return (
    <div className="flex min-h-dvh flex-col bg-slate-900 text-white">
      <ConnectionBanner status={status} />
      <header className="flex items-center justify-between gap-3 px-5 py-4">
        <span className="truncate text-lg font-bold">{me.nickname}</span>
        <span className="rounded-full bg-white/10 px-4 py-1 font-bold tabular-nums">
          {me.score.toLocaleString()}
        </span>
      </header>

      {!game.hostOnline && phase !== 'ENDED' && (
        <p className="mx-5 rounded-xl bg-yellow-400 px-4 py-2 text-center text-sm font-semibold text-slate-950">
          The host lost connection. The game will continue when they return.
        </p>
      )}

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-5 px-5 pb-6 pt-3">
        {phase === 'LOBBY' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <p className="text-3xl font-black">You're in</p>
            <p className="text-slate-300">Look for your name on the big screen.</p>
            <p className="mt-6 text-sm text-slate-400 tabular-nums">
              {game.lobbyCount} {game.lobbyCount === 1 ? 'player' : 'players'} in the room
            </p>
          </div>
        )}

        {phase === 'QUESTION' && question && (
          <>
            <div className="flex items-center gap-4">
              <Countdown
                serverTime={question.serverTime}
                durationMs={question.durationMs}
                onExpire={handleExpire}
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-400 tabular-nums">
                  Question {question.index + 1} of {question.total}
                </p>
                <p className="text-lg font-semibold leading-snug">{question.text}</p>
              </div>
            </div>

            {game.answered ? (
              <LockedIn choice={game.selected} />
            ) : game.timeUp ? (
              <div className="flex flex-1 items-center justify-center text-2xl font-bold">
                Time's up
              </div>
            ) : (
              <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                {question.options.map((option, index) => (
                  <OptionButton
                    key={index}
                    index={index}
                    text={option}
                    onClick={() => answer(index)}
                  />
                ))}
              </div>
            )}
            <ErrorMessage>{game.answerError}</ErrorMessage>
          </>
        )}

        {(phase === 'REVEAL' || phase === 'LEADERBOARD') && (
          <div className="flex flex-1 flex-col justify-center gap-6">
            <ResultCard result={game.result} me={me} />
            {question && game.correctIndex !== null && (
              <p className="text-center text-slate-300">
                Answer:{' '}
                <span className="font-semibold text-white">
                  {question.options[game.correctIndex]}
                </span>
              </p>
            )}
            {phase === 'LEADERBOARD' && game.leaderboard && (
              <Leaderboard entries={game.leaderboard.top} highlight={me.nickname} />
            )}
          </div>
        )}

        {phase === 'ENDED' && game.over && (
          <div className="flex flex-1 flex-col justify-center gap-8 rounded-3xl bg-white p-6 text-slate-900">
            <h1 className="text-center text-3xl font-black">Game over</h1>
            <Podium podium={game.over.podium} />
            {myFinal && (
              <p className="text-center text-lg">
                You finished <span className="font-bold">{ordinal(myFinal.rank)}</span> of{' '}
                {game.over.ranking.length} with{' '}
                <span className="font-bold tabular-nums">{myFinal.score.toLocaleString()}</span>{' '}
                points.
              </p>
            )}
            <LinkButton to="/" variant="primary" size="lg">
              Play again
            </LinkButton>
          </div>
        )}
      </main>
    </div>
  );
}
