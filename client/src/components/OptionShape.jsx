const PATHS = {
  triangle: <path d="M12 3 22 20H2z" />,
  diamond: <path d="M12 2 22 12 12 22 2 12z" />,
  circle: <circle cx="12" cy="12" r="9.5" />,
  square: <rect x="3" y="3" width="18" height="18" rx="2" />,
};

export function OptionShape({ shape, className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      {PATHS[shape]}
    </svg>
  );
}
