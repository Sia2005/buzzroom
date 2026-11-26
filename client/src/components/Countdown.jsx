import { useEffect, useState } from 'react';
import { serverNow } from '../lib/clock.js';

const TICK_MS = 100;
const RADIUS = 44;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function remainingMs(serverTime, durationMs) {
  return Math.max(0, serverTime + durationMs - serverNow());
}

export function Countdown({ serverTime, durationMs, size = 'md', onExpire }) {
  const [remaining, setRemaining] = useState(() => remainingMs(serverTime, durationMs));

  useEffect(() => {
    let expired = false;
    const tick = () => {
      const next = remainingMs(serverTime, durationMs);
      setRemaining(next);
      if (next === 0 && !expired) {
        expired = true;
        onExpire?.();
      }
    };
    const timer = setInterval(tick, TICK_MS);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(timer);
      clearTimeout(first);
    };
  }, [serverTime, durationMs, onExpire]);

  const fraction = durationMs > 0 ? remaining / durationMs : 0;
  const seconds = Math.ceil(remaining / 1000);
  const urgent = remaining <= 5000;
  const dimension = size === 'lg' ? 'h-36 w-36 text-5xl' : 'h-20 w-20 text-2xl';

  return (
    <div
      className={`relative shrink-0 ${dimension}`}
      role="timer"
      aria-live="off"
      aria-label={`${seconds} seconds left`}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={RADIUS} fill="white" stroke="#e2e8f0" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          stroke={urgent ? '#e11d48' : '#0f172a'}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          className="transition-[stroke-dashoffset] duration-100 ease-linear"
        />
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center font-black tabular-nums ${urgent ? 'text-rose-600' : 'text-slate-900'}`}
      >
        {seconds}
      </span>
    </div>
  );
}
