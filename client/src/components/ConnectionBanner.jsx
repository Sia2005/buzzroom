const MESSAGES = {
  connecting: 'Connecting to the game server...',
  reconnecting: 'Connection lost. Reconnecting...',
};

export function ConnectionBanner({ status }) {
  const message = MESSAGES[status];
  if (!message) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 bg-slate-900 px-4 py-2 text-center text-sm font-semibold text-yellow-300"
    >
      {message}
    </div>
  );
}
