import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ConnectionBanner } from '../../components/ConnectionBanner.jsx';
import {
  Button,
  ErrorMessage,
  FullScreenMessage,
  LinkButton,
  LoadingScreen,
  Logo,
} from '../../components/ui.jsx';
import { request, useSocket, useSocketEvent } from '../../hooks/useSocket.js';
import { loadSession } from '../../lib/session.js';

function formatCode(code) {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

export default function Lobby() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [lobby, setLobby] = useState({ players: [], count: 0 });
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  const { status, rejoinError, restoring } = useSocket({
    role: 'host',
    code,
    onSnapshot: (snapshot) => {
      if (snapshot.state !== 'LOBBY') {
        navigate(`/host/game/${code}`, { replace: true });
        return;
      }
      setLobby(snapshot.lobby);
    },
  });

  useSocketEvent('lobby:update', setLobby);

  async function handleStart() {
    const session = loadSession('host');
    setError('');
    setStarting(true);
    const response = await request('host:start', { code, hostToken: session?.hostToken });
    setStarting(false);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    navigate(`/host/game/${code}`);
  }

  if (rejoinError) {
    return (
      <FullScreenMessage
        title="This room is not available"
        action={<LinkButton to="/host">Create a new quiz</LinkButton>}
      >
        {rejoinError.message}
      </FullScreenMessage>
    );
  }

  if (restoring) return <LoadingScreen label="Opening room" />;

  const joinUrl = `${window.location.origin}/join?code=${code}`;

  return (
    <div className="flex min-h-dvh flex-col bg-slate-900 text-white">
      <ConnectionBanner status={status} />
      <header className="flex items-center justify-between px-10 py-6">
        <Logo light to="/host" className="text-xl" />
        <span className="text-lg font-semibold text-slate-300">Lobby</span>
      </header>

      <main className="flex flex-1 flex-col items-center gap-10 px-10 pb-10">
        <section className="flex flex-col items-center gap-3 text-center">
          <p className="text-2xl text-slate-300">
            Join at <span className="font-semibold text-white">{window.location.host}</span> with
            code
          </p>
          <p
            className="font-black tracking-widest text-yellow-300 tabular-nums"
            style={{ fontSize: 'clamp(4rem, 14vw, 11rem)', lineHeight: 1 }}
            aria-label={`Room code ${code.split('').join(' ')}`}
          >
            {formatCode(code)}
          </p>
          <p className="break-all text-sm text-slate-400">{joinUrl}</p>
        </section>

        <section className="flex w-full max-w-5xl flex-1 flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-bold">
              <span className="tabular-nums">{lobby.count}</span>{' '}
              {lobby.count === 1 ? 'player' : 'players'}
            </h2>
            <Button
              variant="accent"
              size="xl"
              onClick={handleStart}
              loading={starting}
              disabled={lobby.count === 0}
            >
              Start game
            </Button>
          </div>
          <ErrorMessage>{error}</ErrorMessage>

          {lobby.count === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-3xl border-2 border-dashed border-slate-700 p-10 text-2xl text-slate-400">
              Waiting for players to join
            </div>
          ) : (
            <ul className="flex flex-wrap gap-3">
              {lobby.players.map((nickname) => (
                <li
                  key={nickname}
                  className="rounded-xl bg-white/10 px-5 py-3 text-2xl font-semibold"
                >
                  {nickname}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
