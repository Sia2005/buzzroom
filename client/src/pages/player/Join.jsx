import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, ErrorMessage, Logo } from '../../components/ui.jsx';
import { request } from '../../hooks/useSocket.js';
import { clearSession, loadSession, saveSession } from '../../lib/session.js';

const ROOM_CODE_PATTERN = /^\d{6}$/;

export default function Join() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [code, setCode] = useState(() => (params.get('code') ?? '').replace(/\D/g, '').slice(0, 6));
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const [previous, setPrevious] = useState(() => loadSession('player'));

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmed = nickname.trim();
    if (!ROOM_CODE_PATTERN.test(code)) return setError('Enter the 6-digit room code.');
    if (!trimmed) return setError('Choose a nickname.');

    setError('');
    setJoining(true);
    const response = await request('player:join', { code, nickname: trimmed });
    setJoining(false);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    saveSession('player', {
      code,
      playerToken: response.playerToken,
      nickname: response.nickname,
    });
    navigate(`/play/${code}`);
  }

  function forgetPrevious() {
    clearSession('player');
    setPrevious(null);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-slate-900 px-5 py-6 text-white">
      <header className="flex items-center justify-between">
        <Logo light />
        <Link to="/host" className="text-sm font-medium text-slate-400 hover:text-white">
          Host a quiz
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6">
        <h1 className="text-center text-3xl font-black">Join a game</h1>

        {previous && (
          <div className="rounded-2xl bg-white/10 p-4">
            <p className="text-sm text-slate-300">
              You were playing in room{' '}
              <span className="font-mono font-semibold">{previous.code}</span>
              {previous.nickname ? ` as ${previous.nickname}` : ''}.
            </p>
            <div className="mt-3 flex gap-2">
              <Button variant="accent" size="sm" onClick={() => navigate(`/play/${previous.code}`)}>
                Rejoin
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-300 hover:bg-white/10 hover:text-white"
                onClick={forgetPrevious}
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-slate-300">Room code</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="off"
              placeholder="123456"
              className="rounded-2xl bg-white px-5 py-4 text-center font-mono text-3xl font-bold tracking-[0.3em] text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-4 focus:ring-yellow-400"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-slate-300">Nickname</span>
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              maxLength={16}
              autoComplete="nickname"
              placeholder="Your name"
              className="rounded-2xl bg-white px-5 py-4 text-xl font-semibold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-4 focus:ring-yellow-400"
            />
          </label>
          <ErrorMessage>{error}</ErrorMessage>
          <Button type="submit" variant="accent" size="lg" loading={joining}>
            Enter
          </Button>
        </form>
      </main>
    </div>
  );
}
