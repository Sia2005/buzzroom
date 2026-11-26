import { useReducer, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnswerDistribution } from '../../components/AnswerDistribution.jsx';
import { ConnectionBanner } from '../../components/ConnectionBanner.jsx';
import { Countdown } from '../../components/Countdown.jsx';
import { Leaderboard } from '../../components/Leaderboard.jsx';
import { OptionButton } from '../../components/OptionButton.jsx';
import { Podium } from '../../components/Podium.jsx';
import {
  Button,
  ErrorMessage,
  FullScreenMessage,
  LinkButton,
  LoadingScreen,
  Logo,
} from '../../components/ui.jsx';
import { request, useSocket, useSocketEvent } from '../../hooks/useSocket.js';
import { clearSession, loadSession } from '../../lib/session.js';

const initialState = {
  state: null,
  question: null,
  progress: null,
  reveal: null,
  leaderboard: null,
  over: null,
};

function reducer(current, action) {
  switch (action.type) {
    case 'snapshot': {
      const { snapshot } = action;
      return {
        ...initialState,
        state: snapshot.state,
        question: snapshot.question,
        progress: snapshot.progress,
        reveal: snapshot.reveal,
        leaderboard: snapshot.leaderboard,
      };
    }
    case 'question:show':
      return {
        ...initialState,
        state: 'QUESTION',
        question: action.payload,
        progress: {
          index: action.payload.index,
          answered: 0,
          expected: current.progress?.expected ?? 0,
        },
      };
    case 'answer:progress':
      if (action.payload.index !== current.question?.index) return current;
      return { ...current, progress: action.payload };
    case 'question:end':
      return { ...current, state: 'REVEAL', reveal: action.payload };
    case 'leaderboard:update':
      return { ...current, state: 'LEADERBOARD', leaderboard: action.payload };
    case 'game:over':
      return { ...current, state: 'ENDED', over: action.payload };
    default:
      return current;
  }
}

function QuestionHeader({ question }) {
  return (
    <h1 className="text-center text-4xl font-bold leading-tight text-slate-900 lg:text-5xl">
      {question.text}
    </h1>
  );
}

function OptionsGrid({ question, reveal }) {
  return (
    <div className="grid w-full gap-4 md:grid-cols-2">
      {question.options.map((option, index) => {
        let status = 'idle';
        if (reveal) status = index === reveal.correctIndex ? 'correct' : 'dimmed';
        return <OptionButton key={index} index={index} text={option} size="host" status={status} />;
      })}
    </div>
  );
}

export default function HostGame() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [game, dispatch] = useReducer(reducer, initialState);
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState('');

  const { status, rejoinError, restoring } = useSocket({
    role: 'host',
    code,
    onSnapshot: (snapshot) => {
      if (snapshot.state === 'LOBBY') {
        navigate(`/host/lobby/${code}`, { replace: true });
        return;
      }
      dispatch({ type: 'snapshot', snapshot });
    },
  });

  useSocketEvent('question:show', (payload) => dispatch({ type: 'question:show', payload }));
  useSocketEvent('answer:progress', (payload) => dispatch({ type: 'answer:progress', payload }));
  useSocketEvent('question:end', (payload) => dispatch({ type: 'question:end', payload }));
  useSocketEvent('leaderboard:update', (payload) =>
    dispatch({ type: 'leaderboard:update', payload }),
  );
  useSocketEvent('game:over', (payload) => {
    clearSession('host');
    dispatch({ type: 'game:over', payload });
  });

  async function handleNext() {
    setError('');
    setAdvancing(true);
    const response = await request('host:next', {
      code,
      hostToken: loadSession('host')?.hostToken,
    });
    setAdvancing(false);
    if (!response.ok) setError(response.error.message);
  }

  if (rejoinError && game.state !== 'ENDED') {
    return (
      <FullScreenMessage
        title="This game is not available"
        action={<LinkButton to="/host">Create a new quiz</LinkButton>}
      >
        {rejoinError.message}
      </FullScreenMessage>
    );
  }

  if (restoring || !game.state) return <LoadingScreen label="Loading game" />;

  const { question, reveal, leaderboard, progress, over } = game;

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <ConnectionBanner status={status} />
      <header className="flex items-center justify-between px-8 py-5">
        <Logo to="/host" className="text-xl" />
        <div className="flex items-center gap-6 text-lg font-semibold text-slate-600">
          {question && game.state !== 'ENDED' && (
            <span className="tabular-nums">
              Question {question.index + 1} of {question.total}
            </span>
          )}
          <span className="rounded-lg bg-slate-900 px-3 py-1 font-mono text-white">{code}</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center gap-8 px-8 pb-10">
        {game.state === 'QUESTION' && question && (
          <>
            <QuestionHeader question={question} />
            <div className="flex w-full items-center justify-between">
              <Countdown
                serverTime={question.serverTime}
                durationMs={question.durationMs}
                size="lg"
              />
              <div className="text-right">
                <p className="text-6xl font-black tabular-nums text-slate-900">
                  {progress?.answered ?? 0}
                  <span className="text-3xl text-slate-400"> / {progress?.expected ?? 0}</span>
                </p>
                <p className="text-xl font-medium text-slate-500">answers</p>
              </div>
            </div>
            <OptionsGrid question={question} />
          </>
        )}

        {game.state === 'REVEAL' && question && reveal && (
          <>
            <QuestionHeader question={question} />
            <AnswerDistribution
              answerCounts={reveal.answerCounts}
              correctIndex={reveal.correctIndex}
            />
            <OptionsGrid question={question} reveal={reveal} />
          </>
        )}

        {game.state === 'LEADERBOARD' && leaderboard && (
          <div className="flex w-full max-w-3xl flex-1 flex-col gap-8">
            <h1 className="text-center text-5xl font-black text-slate-900">Leaderboard</h1>
            <Leaderboard entries={leaderboard.top} size="lg" />
            <ErrorMessage>{error}</ErrorMessage>
            <Button size="xl" onClick={handleNext} loading={advancing} className="self-center">
              {leaderboard.isLastQuestion ? 'Show final results' : 'Next question'}
            </Button>
          </div>
        )}

        {game.state === 'ENDED' && over && (
          <div className="flex w-full flex-col items-center gap-10">
            <h1 className="text-5xl font-black text-slate-900">Final podium</h1>
            <Podium podium={over.podium} size="lg" />
            <p className="text-xl text-slate-600">
              {over.ranking.length} {over.ranking.length === 1 ? 'player' : 'players'} took part.
            </p>
            <div className="flex gap-3">
              <LinkButton to={`/host/results/${over.resultId}`} size="lg">
                View full results
              </LinkButton>
              <LinkButton to="/host" size="lg" variant="secondary">
                New quiz
              </LinkButton>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
