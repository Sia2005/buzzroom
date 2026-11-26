#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { io } from 'socket.io-client';

const USAGE = `Usage: npm run loadtest -- --code <room code> [options]

Options:
  --url <url>              Server URL (default http://localhost:4000)
  --code <code>            6-digit room code shown in the host lobby (required)
  --players <n>            Number of simulated players (default 100)
  --concurrency <n>        Bots connecting at the same time while joining (default 25)
  --prefix <name>          Nickname prefix (default bot)
  --help                   Show this message`;

const JOIN_TIMEOUT_MS = 10_000;
const ANSWER_TIMEOUT_MS = 10_000;
const MIN_THINK_MS = 200;

function exitWithUsage(message) {
  process.stderr.write(`${message}\n\n${USAGE}\n`);
  process.exit(1);
}

function readArgs() {
  try {
    return parseArgs({
      options: {
        url: { type: 'string', default: 'http://localhost:4000' },
        code: { type: 'string' },
        players: { type: 'string', default: '100' },
        concurrency: { type: 'string', default: '25' },
        prefix: { type: 'string', default: 'bot' },
        help: { type: 'boolean', default: false },
      },
    }).values;
  } catch (error) {
    return exitWithUsage(error.message);
  }
}

function parseOptions() {
  const values = readArgs();

  if (values.help) {
    process.stdout.write(`${USAGE}\n`);
    process.exit(0);
  }

  const players = Number(values.players);
  const concurrency = Number(values.concurrency);
  const problems = [];
  if (!/^\d{6}$/.test(values.code ?? '')) problems.push('--code must be a 6-digit room code');
  if (!Number.isInteger(players) || players < 1)
    problems.push('--players must be a positive integer');
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    problems.push('--concurrency must be a positive integer');
  }
  if (values.prefix.length > 9) problems.push('--prefix must be at most 9 characters');
  if (problems.length > 0) exitWithUsage(problems.join('\n'));

  return { url: values.url, code: values.code, players, concurrency, prefix: values.prefix };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted.at(-1) ?? null,
  };
}

function formatMs(value) {
  return value === null ? '-' : `${Math.round(value)}`;
}

function printTable(headers, rows) {
  const widths = headers.map((header, i) =>
    Math.max(header.length, ...rows.map((row) => String(row[i]).length)),
  );
  const line = (cells) => cells.map((cell, i) => String(cell).padStart(widths[i])).join('  ');
  process.stdout.write(`${line(headers)}\n${widths.map((w) => '-'.repeat(w)).join('  ')}\n`);
  for (const row of rows) process.stdout.write(`${line(row)}\n`);
}

function createMetrics() {
  return {
    joined: 0,
    joinFailures: new Map(),
    joinLatency: [],
    broadcastLatency: new Map(),
    answerLatency: [],
    answersSent: 0,
    answersAccepted: 0,
    answerRejections: new Map(),
    results: 0,
    disconnects: 0,
    finished: 0,
  };
}

const increment = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);

function createBot(index, options, metrics, onFinished) {
  const nickname = `${options.prefix}-${index}`;
  const socket = io(options.url, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    timeout: JOIN_TIMEOUT_MS,
  });
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    onFinished();
  };

  socket.on('question:show', (question) => {
    const latency = Date.now() - question.serverTime;
    if (!metrics.broadcastLatency.has(question.index))
      metrics.broadcastLatency.set(question.index, []);
    metrics.broadcastLatency.get(question.index).push(latency);

    const window = Math.max(MIN_THINK_MS, question.durationMs * 0.9);
    const delay = MIN_THINK_MS + Math.random() * (window - MIN_THINK_MS);
    setTimeout(async () => {
      const choice = Math.floor(Math.random() * question.options.length);
      const sentAt = Date.now();
      metrics.answersSent += 1;
      try {
        const response = await socket.timeout(ANSWER_TIMEOUT_MS).emitWithAck('player:answer', {
          code: options.code,
          questionIndex: question.index,
          choice,
        });
        metrics.answerLatency.push(Date.now() - sentAt);
        if (response.ok) metrics.answersAccepted += 1;
        else increment(metrics.answerRejections, response.error?.code ?? 'UNKNOWN');
      } catch {
        increment(metrics.answerRejections, 'ACK_TIMEOUT');
      }
    }, delay);
  });

  socket.on('answer:result', () => {
    metrics.results += 1;
  });

  socket.on('game:over', () => {
    socket.disconnect();
    finish();
  });

  socket.on('disconnect', (reason) => {
    if (reason !== 'io client disconnect') metrics.disconnects += 1;
    finish();
  });

  const joined = new Promise((resolve) => {
    socket.once('connect_error', (error) => {
      increment(metrics.joinFailures, `CONNECT_ERROR: ${error.message}`);
      finish();
      resolve();
    });
    socket.once('connect', async () => {
      const startedAt = Date.now();
      try {
        const response = await socket
          .timeout(JOIN_TIMEOUT_MS)
          .emitWithAck('player:join', { code: options.code, nickname });
        if (response.ok) {
          metrics.joined += 1;
          metrics.joinLatency.push(Date.now() - startedAt);
        } else {
          increment(metrics.joinFailures, response.error?.code ?? 'UNKNOWN');
          socket.disconnect();
          finish();
        }
      } catch {
        increment(metrics.joinFailures, 'ACK_TIMEOUT');
        socket.disconnect();
        finish();
      }
      resolve();
    });
  });

  return { socket, joined };
}

async function runPool(total, concurrency, task) {
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, total) }, async () => {
    while (next < total) {
      const index = next;
      next += 1;
      await task(index);
    }
  });
  await Promise.all(workers);
}

function printReport(options, metrics, startedAt) {
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  process.stdout.write(
    `\nBuzzroom load test: ${options.players} bots, room ${options.code}, ${elapsedSec}s\n\n`,
  );

  const joinFailures = [...metrics.joinFailures.values()].reduce((a, b) => a + b, 0);
  const join = summarize(metrics.joinLatency);
  process.stdout.write(
    `Joins: ${metrics.joined} ok, ${joinFailures} failed | join ack p50 ${formatMs(join.p50)} ms, p95 ${formatMs(join.p95)} ms\n`,
  );
  for (const [reason, count] of metrics.joinFailures)
    process.stdout.write(`  join failure ${reason}: ${count}\n`);

  process.stdout.write('\nBroadcast latency per question:show (receive time - serverTime, ms)\n');
  const questionRows = [...metrics.broadcastLatency.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, samples]) => {
      const stats = summarize(samples);
      return [
        `Q${index + 1}`,
        stats.count,
        formatMs(stats.p50),
        formatMs(stats.p95),
        formatMs(stats.p99),
        formatMs(stats.max),
      ];
    });
  if (questionRows.length === 0) process.stdout.write('  no questions were received\n');
  else printTable(['question', 'samples', 'p50', 'p95', 'p99', 'max'], questionRows);

  const allBroadcast = summarize([...metrics.broadcastLatency.values()].flat());
  const answer = summarize(metrics.answerLatency);
  const rejected = [...metrics.answerRejections.values()].reduce((a, b) => a + b, 0);

  process.stdout.write('\nSummary\n');
  printTable(
    ['metric', 'count', 'p50', 'p95', 'p99', 'max'],
    [
      [
        'broadcast latency',
        allBroadcast.count,
        formatMs(allBroadcast.p50),
        formatMs(allBroadcast.p95),
        formatMs(allBroadcast.p99),
        formatMs(allBroadcast.max),
      ],
      [
        'answer ack round trip',
        answer.count,
        formatMs(answer.p50),
        formatMs(answer.p95),
        formatMs(answer.p99),
        formatMs(answer.max),
      ],
    ],
  );
  process.stdout.write(
    `\nAnswers: ${metrics.answersSent} sent, ${metrics.answersAccepted} accepted, ${rejected} rejected | results received: ${metrics.results} | unexpected disconnects: ${metrics.disconnects}\n`,
  );
  for (const [reason, count] of metrics.answerRejections)
    process.stdout.write(`  rejected ${reason}: ${count}\n`);
  process.stdout.write(
    '\nLatency assumes the bots and the server share a clock (same machine or NTP-synced).\n',
  );
}

async function main() {
  const options = parseOptions();
  const metrics = createMetrics();
  const bots = [];
  const startedAt = Date.now();
  let reported = false;

  const report = (exitCode = 0) => {
    if (reported) return;
    reported = true;
    printReport(options, metrics, startedAt);
    for (const bot of bots) bot.socket.disconnect();
    process.exit(exitCode);
  };

  const onFinished = () => {
    metrics.finished += 1;
    if (metrics.finished >= options.players) report(0);
  };

  process.on('SIGINT', () => report(130));
  process.stdout.write(
    `Connecting ${options.players} bots to ${options.url}, room ${options.code}...\n`,
  );

  await runPool(options.players, options.concurrency, async (index) => {
    const bot = createBot(index + 1, options, metrics, onFinished);
    bots.push(bot);
    await bot.joined;
  });

  process.stdout.write(
    `${metrics.joined} bots joined. Start the game from the host screen. Press Ctrl+C to stop early.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`Load test failed: ${error.stack ?? error}\n`);
  process.exit(1);
});
