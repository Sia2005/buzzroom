import { createServer } from 'node:http';
import { Redis } from 'ioredis';
import { Server } from 'socket.io';
import { io as connectClient } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createGameEngine } from '../src/game/gameEngine.js';
import { roomKeys, createRoomStore } from '../src/game/roomStore.js';
import { registerSocketHandlers } from '../src/game/socketHandlers.js';

const REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/15';
const QUIZ_ID = 'a'.repeat(24);

async function redisAvailable() {
  const probe = new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    retryStrategy: null,
  });
  try {
    await probe.connect();
    await probe.ping();
    return true;
  } catch {
    return false;
  } finally {
    probe.disconnect();
  }
}

const silentLogger = { debug() {}, info() {}, warn() {}, error() {}, child: () => silentLogger };

const quiz = {
  durationSec: 2,
  questions: [
    { text: 'What is two plus two?', options: ['3', '4', '5', '6'], correctIndex: 1 },
    {
      text: 'Which planet is closest to the Sun?',
      options: ['Venus', 'Earth', 'Mercury', 'Mars'],
      correctIndex: 2,
    },
  ],
};

const waitFor = (socket, event, timeoutMs = 4000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

const request = (socket, event, payload) => socket.timeout(4000).emitWithAck(event, payload);

describe.skipIf(!(await redisAvailable()))('game engine with Redis and Socket.IO', () => {
  let redis;
  let io;
  let httpServer;
  let url;
  let engine;
  const savedResults = [];
  const clients = [];

  const connect = async () => {
    const socket = connectClient(url, { transports: ['websocket'], forceNew: true });
    clients.push(socket);
    await waitFor(socket, 'connect');
    return socket;
  };

  beforeAll(async () => {
    redis = new Redis(REDIS_URL);
    await redis.flushdb();
    httpServer = createServer();
    io = new Server(httpServer);
    engine = createGameEngine({
      io,
      store: createRoomStore(redis, { ttlSeconds: 600 }),
      quizzes: { getQuiz: async (id) => (id === QUIZ_ID ? quiz : null) },
      results: { save: async (result) => savedResults.push(result) },
      logger: silentLogger,
      revealMs: 50,
      createResultId: () => 'b'.repeat(24),
    });
    registerSocketHandlers(io, engine, silentLogger);
    await new Promise((resolve) => httpServer.listen(0, resolve));
    url = `http://127.0.0.1:${httpServer.address().port}`;
  });

  afterEach(() => {
    while (clients.length) clients.pop().disconnect();
  });

  afterAll(async () => {
    engine.shutdown();
    await new Promise((resolve) => io.close(resolve));
    await redis.flushdb();
    await redis.quit();
  });

  async function setupRoom(nicknames) {
    const host = await connect();
    const { code, hostToken } = await request(host, 'host:create', { quizId: QUIZ_ID });
    const players = [];
    for (const nickname of nicknames) {
      const socket = await connect();
      const joined = await request(socket, 'player:join', { code, nickname });
      players.push({ socket, ...joined });
    }
    return { host, code, hostToken, players };
  }

  it('rejects an unknown quiz and a bad payload', async () => {
    const host = await connect();
    const missing = await request(host, 'host:create', { quizId: 'c'.repeat(24) });
    expect(missing).toMatchObject({ ok: false, error: { code: 'QUIZ_NOT_FOUND' } });
    const invalid = await request(host, 'player:join', { code: '12', nickname: '' });
    expect(invalid).toMatchObject({ ok: false, error: { code: 'INVALID_PAYLOAD' } });
  });

  it('plays a full game, scores it, saves the result and cleans up Redis', async () => {
    const { host, code, hostToken, players } = await setupRoom(['Ada', 'Linus']);
    const [ada, linus] = players;
    expect(code).toMatch(/^\d{6}$/);

    const duplicate = await request(await connect(), 'player:join', { code, nickname: '  ADA ' });
    expect(duplicate).toMatchObject({ ok: false, error: { code: 'NICKNAME_TAKEN' } });

    const shown = waitFor(ada.socket, 'question:show');
    expect(await request(host, 'host:start', { code, hostToken })).toMatchObject({ ok: true });
    const question = await shown;
    expect(question).toMatchObject({ index: 0, total: 2, durationMs: 2000 });
    expect(question).not.toHaveProperty('correctIndex');

    const lateJoin = await request(await connect(), 'player:join', { code, nickname: 'Late' });
    expect(lateJoin).toMatchObject({ ok: false, error: { code: 'GAME_STARTED' } });

    const adaResult = waitFor(ada.socket, 'answer:result');
    const linusResult = waitFor(linus.socket, 'answer:result');
    const ended = waitFor(host, 'question:end');
    const leaderboard = waitFor(host, 'leaderboard:update');

    expect(
      await request(ada.socket, 'player:answer', { code, questionIndex: 0, choice: 1 }),
    ).toMatchObject({ ok: true });
    const again = await request(ada.socket, 'player:answer', { code, questionIndex: 0, choice: 2 });
    expect(again).toMatchObject({ ok: false, error: { code: 'ALREADY_ANSWERED' } });
    await request(linus.socket, 'player:answer', { code, questionIndex: 0, choice: 0 });

    const reveal = await ended;
    expect(reveal).toEqual({ index: 0, correctIndex: 1, answerCounts: [1, 1, 0, 0] });

    const adaOutcome = await adaResult;
    expect(adaOutcome).toMatchObject({ correct: true, rank: 1 });
    expect(adaOutcome.points).toBeGreaterThanOrEqual(500);
    expect(await linusResult).toMatchObject({ correct: false, points: 0, totalScore: 0, rank: 2 });

    const board = await leaderboard;
    expect(board.top[0]).toEqual({ nickname: 'Ada', score: adaOutcome.points });
    expect(board.isLastQuestion).toBe(false);

    const lateAnswer = await request(linus.socket, 'player:answer', {
      code,
      questionIndex: 0,
      choice: 1,
    });
    expect(lateAnswer).toMatchObject({ ok: false, error: { code: 'NOT_ALLOWED' } });

    const secondShown = waitFor(linus.socket, 'question:show');
    await request(host, 'host:next', { code, hostToken });
    expect((await secondShown).index).toBe(1);

    const secondBoard = waitFor(host, 'leaderboard:update');
    await request(ada.socket, 'player:answer', { code, questionIndex: 1, choice: 2 });
    await request(linus.socket, 'player:answer', { code, questionIndex: 1, choice: 2 });
    expect((await secondBoard).isLastQuestion).toBe(true);

    const over = waitFor(ada.socket, 'game:over');
    expect(await request(host, 'host:next', { code, hostToken })).toMatchObject({
      ok: true,
      ended: true,
    });
    const final = await over;
    expect(final.podium.map((p) => p.nickname)).toEqual(['Ada', 'Linus']);
    expect(final.ranking[0]).toMatchObject({ rank: 1, correctCount: 2 });

    await expect.poll(() => savedResults.length).toBe(1);
    expect(savedResults[0].perQuestion).toHaveLength(2);
    expect(savedResults[0].perQuestion[0]).toMatchObject({
      correctPct: 50,
      answerCounts: [1, 1, 0, 0],
    });
    await expect.poll(() => redis.keys(`${roomKeys(code).room}*`)).toEqual([]);
  });

  it('ends the question on the timer when someone does not answer', async () => {
    const { host, code, hostToken, players } = await setupRoom(['Quiet']);
    await request(host, 'host:start', { code, hostToken });
    const result = await waitFor(players[0].socket, 'answer:result', 4000);
    expect(result).toMatchObject({ answered: false, correct: false, points: 0 });
  });

  it('keeps a disconnected player and restores them with a snapshot', async () => {
    const { host, code, hostToken, players } = await setupRoom(['Grace', 'Alan']);
    const [grace, alan] = players;
    await request(host, 'host:start', { code, hostToken });
    await request(grace.socket, 'player:answer', { code, questionIndex: 0, choice: 1 });

    alan.socket.disconnect();
    const reveal = await waitFor(host, 'question:end');
    expect(reveal.answerCounts).toEqual([0, 1, 0, 0]);

    const returning = await connect();
    const rejoined = await request(returning, 'player:rejoin', {
      code,
      playerToken: alan.playerToken,
    });
    expect(rejoined.ok).toBe(true);
    expect(rejoined.snapshot).toMatchObject({
      state: expect.stringMatching(/REVEAL|LEADERBOARD/),
      question: { index: 0 },
      me: { nickname: 'Alan', score: 0, answered: false },
    });
    expect(rejoined.snapshot.question).not.toHaveProperty('correctIndex');

    const forged = await request(await connect(), 'player:rejoin', {
      code,
      playerToken: 'x'.repeat(32),
    });
    expect(forged).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('pauses on host disconnect and lets the host rejoin with the token', async () => {
    const { host, code, hostToken, players } = await setupRoom(['Edsger']);
    const offline = waitFor(players[0].socket, 'host:status');
    host.disconnect();
    expect(await offline).toEqual({ online: false });

    const online = waitFor(players[0].socket, 'host:status');
    const returning = await connect();
    const rejoined = await request(returning, 'host:rejoin', { code, hostToken });
    expect(rejoined).toMatchObject({ ok: true, snapshot: { state: 'LOBBY', hostOnline: true } });
    expect(rejoined.snapshot.lobby.players).toEqual(['Edsger']);
    expect(await online).toEqual({ online: true });
  });

  it('only lets the host token control the game', async () => {
    const { code, players } = await setupRoom(['Mallory']);
    const attempt = await request(players[0].socket, 'host:start', {
      code,
      hostToken: 'y'.repeat(32),
    });
    expect(attempt).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
  });
});
