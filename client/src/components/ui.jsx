import { Link } from 'react-router-dom';

const BUTTON_VARIANTS = {
  primary:
    'bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500',
  accent:
    'bg-yellow-400 text-slate-950 hover:bg-yellow-300 disabled:bg-slate-200 disabled:text-slate-400',
  secondary:
    'bg-white text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  danger: 'bg-white text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50',
  ghost: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
};

const BUTTON_SIZES = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-base',
  lg: 'px-6 py-3.5 text-lg',
  xl: 'px-8 py-5 text-2xl',
};

function buttonClasses(variant, size, className) {
  return `inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`;
}

export function LinkButton({ to, variant = 'primary', size = 'md', className = '', children }) {
  return (
    <Link to={to} className={buttonClasses(variant, size, className)}>
      {children}
    </Link>
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  loading,
  disabled,
  children,
  ...props
}) {
  return (
    <button
      type="button"
      className={buttonClasses(variant, size, className)}
      disabled={loading || disabled}
      {...props}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function Spinner({ className = 'h-6 w-6' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Card({ className = '', padded = true, children }) {
  return (
    <div
      className={`rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 ${padded ? 'p-6' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

export function ErrorMessage({ children, className = '' }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className={`rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200 ${className}`}
    >
      {children}
    </p>
  );
}

export function Logo({ to = '/', light = false, className = '' }) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-2 font-bold tracking-tight ${light ? 'text-white' : 'text-slate-900'} ${className}`}
    >
      <span className="inline-block h-3 w-3 rounded-full bg-yellow-400 ring-4 ring-yellow-200" />
      Buzzroom
    </Link>
  );
}

export function FullScreenMessage({ title, children, action }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-6">
      <Card className="w-full max-w-md text-center">
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {children && <div className="mt-2 text-slate-600">{children}</div>}
        {action && <div className="mt-6">{action}</div>}
      </Card>
    </div>
  );
}

export function LoadingScreen({ label = 'Loading' }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-slate-50 text-slate-500">
      <Spinner />
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}
