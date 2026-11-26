const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function serializeError(error) {
  if (!(error instanceof Error)) return error;
  return { name: error.name, message: error.message, stack: error.stack };
}

function serializeMeta(meta) {
  if (!meta) return {};
  if (meta instanceof Error) return { error: serializeError(meta) };
  return Object.fromEntries(
    Object.entries(meta).map(([key, value]) => [key, serializeError(value)]),
  );
}

export function createLogger({ level = 'info', scope } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;

  function write(levelName, message, meta) {
    if (LEVELS[levelName] < threshold) return;
    const entry = {
      time: new Date().toISOString(),
      level: levelName,
      ...(scope && { scope }),
      message,
      ...serializeMeta(meta),
    };
    const stream = LEVELS[levelName] >= LEVELS.warn ? process.stderr : process.stdout;
    stream.write(`${JSON.stringify(entry)}\n`);
  }

  return {
    debug: (message, meta) => write('debug', message, meta),
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
    child: (childScope) =>
      createLogger({ level, scope: scope ? `${scope}:${childScope}` : childScope }),
  };
}
