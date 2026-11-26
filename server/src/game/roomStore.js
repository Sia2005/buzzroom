import { generateRoomCode } from '../utils/tokens.js';

export const JOIN_RESULT = Object.freeze({
  OK: 1,
  NICKNAME_TAKEN: 0,
  NOT_IN_LOBBY: -1,
  ROOM_FULL: -2,
  ROOM_NOT_FOUND: -3,
});

const JOIN_SCRIPT = `
local state = redis.call('HGET', KEYS[1], 'state')
if not state then return -3 end
if state ~= 'LOBBY' then return -1 end
if redis.call('HLEN', KEYS[2]) >= tonumber(ARGV[6]) then return -2 end
if redis.call('HSETNX', KEYS[3], ARGV[3], ARGV[1]) == 0 then return 0 end
redis.call('HSET', KEYS[2], ARGV[1], ARGV[2])
redis.call('HSET', KEYS[4], ARGV[4], ARGV[1])
redis.call('HSET', KEYS[5], ARGV[1], ARGV[5])
redis.call('ZADD', KEYS[6], 0, ARGV[1])
for i = 2, #KEYS do redis.call('EXPIRE', KEYS[i], ARGV[7]) end
return 1
`;

const TRANSITION_SCRIPT = `
if redis.call('HGET', KEYS[1], 'state') ~= ARGV[1] then return 0 end
if ARGV[3] ~= '' and redis.call('HGET', KEYS[1], ARGV[3]) ~= ARGV[4] then return 0 end
redis.call('HSET', KEYS[1], 'state', ARGV[2])
for i = 5, #ARGV, 2 do redis.call('HSET', KEYS[1], ARGV[i], ARGV[i + 1]) end
return 1
`;

const DELETE_IF_EQUALS_SCRIPT = `
if redis.call('HGET', KEYS[1], ARGV[1]) == ARGV[2] then
  return redis.call('HDEL', KEYS[1], ARGV[1])
end
return 0
`;

const RELEASE_HOST_SCRIPT = `
if redis.call('HGET', KEYS[1], 'hostSocketId') ~= ARGV[1] then return 0 end
redis.call('HDEL', KEYS[1], 'hostSocketId')
redis.call('HSET', KEYS[1], 'hostOnline', '0')
return 1
`;

export function roomKeys(code) {
  const base = `room:${code}`;
  return {
    room: base,
    claim: `${base}:claim`,
    quiz: `${base}:quiz`,
    players: `${base}:players`,
    nicknames: `${base}:nicknames`,
    tokens: `${base}:tokens`,
    online: `${base}:online`,
    leaderboard: `${base}:lb`,
    streaks: `${base}:streaks`,
    correct: `${base}:correct`,
    results: `${base}:results`,
    stats: `${base}:stats`,
    answers: (index) => `${base}:q:${index}:answers`,
  };
}

function parseRoom(hash) {
  if (!hash || !hash.state) return null;
  return {
    state: hash.state,
    quizId: hash.quizId,
    hostToken: hash.hostToken,
    hostOnline: hash.hostOnline === '1',
    currentIndex: Number(hash.currentIndex ?? -1),
    questionStartedAt: Number(hash.questionStartedAt ?? 0),
    durationMs: Number(hash.durationMs),
    total: Number(hash.total),
  };
}

function toScoreEntries(flat) {
  const entries = [];
  for (let i = 0; i < flat.length; i += 2) {
    entries.push({ playerId: flat[i], score: Number(flat[i + 1]) });
  }
  return entries;
}

export function createRoomStore(redis, { ttlSeconds = 7200, maxPlayers = 1000 } = {}) {
  redis.defineCommand('buzzJoin', { numberOfKeys: 6, lua: JOIN_SCRIPT });
  redis.defineCommand('buzzTransition', { numberOfKeys: 1, lua: TRANSITION_SCRIPT });
  redis.defineCommand('buzzDeleteIfEquals', { numberOfKeys: 1, lua: DELETE_IF_EQUALS_SCRIPT });
  redis.defineCommand('buzzReleaseHost', { numberOfKeys: 1, lua: RELEASE_HOST_SCRIPT });

  const questionCache = new Map();

  async function claimRoomCode(maxAttempts = 20) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const code = generateRoomCode();
      const claimed = await redis.set(roomKeys(code).claim, '1', 'EX', ttlSeconds, 'NX');
      if (claimed === 'OK') return code;
    }
    throw new Error('Could not allocate a unique room code');
  }

  async function createRoom({ code, quizId, hostToken, questions, durationMs }) {
    const keys = roomKeys(code);
    await redis
      .multi()
      .hset(keys.room, {
        state: 'LOBBY',
        quizId,
        hostToken,
        hostOnline: '1',
        currentIndex: '-1',
        questionStartedAt: '0',
        durationMs: String(durationMs),
        total: String(questions.length),
        createdAt: String(Date.now()),
      })
      .set(keys.quiz, JSON.stringify(questions), 'EX', ttlSeconds)
      .expire(keys.room, ttlSeconds)
      .exec();
    questionCache.set(code, questions);
  }

  async function getRoom(code) {
    return parseRoom(await redis.hgetall(roomKeys(code).room));
  }

  async function getQuestions(code) {
    if (questionCache.has(code)) return questionCache.get(code);
    const raw = await redis.get(roomKeys(code).quiz);
    if (!raw) return null;
    const questions = JSON.parse(raw);
    questionCache.set(code, questions);
    return questions;
  }

  async function transition(code, from, to, { fields = {}, guard } = {}) {
    const pairs = Object.entries(fields).flatMap(([field, value]) => [field, String(value)]);
    const result = await redis.buzzTransition(
      roomKeys(code).room,
      from,
      to,
      guard ? guard.field : '',
      guard ? String(guard.value) : '',
      ...pairs,
    );
    return result === 1;
  }

  async function setHostSocket(code, socketId) {
    await redis.hset(roomKeys(code).room, { hostSocketId: socketId, hostOnline: '1' });
  }

  async function releaseHostSocket(code, socketId) {
    return (await redis.buzzReleaseHost(roomKeys(code).room, socketId)) === 1;
  }

  async function addPlayer(code, { playerId, nickname, nicknameKey, playerToken, socketId }) {
    const keys = roomKeys(code);
    return redis.buzzJoin(
      keys.room,
      keys.players,
      keys.nicknames,
      keys.tokens,
      keys.online,
      keys.leaderboard,
      playerId,
      nickname,
      nicknameKey,
      playerToken,
      socketId,
      maxPlayers,
      ttlSeconds,
    );
  }

  async function findPlayerByToken(code, playerToken) {
    return redis.hget(roomKeys(code).tokens, playerToken);
  }

  async function getNickname(code, playerId) {
    return redis.hget(roomKeys(code).players, playerId);
  }

  async function getPlayers(code) {
    return redis.hgetall(roomKeys(code).players);
  }

  async function countPlayers(code) {
    return redis.hlen(roomKeys(code).players);
  }

  async function setOnline(code, playerId, socketId) {
    const key = roomKeys(code).online;
    await redis.multi().hset(key, playerId, socketId).expire(key, ttlSeconds).exec();
  }

  async function setOffline(code, playerId, socketId) {
    return (await redis.buzzDeleteIfEquals(roomKeys(code).online, playerId, socketId)) === 1;
  }

  async function getOnline(code) {
    return redis.hgetall(roomKeys(code).online);
  }

  async function countOnline(code) {
    return redis.hlen(roomKeys(code).online);
  }

  async function recordAnswer(code, index, playerId, encodedAnswer) {
    const key = roomKeys(code).answers(index);
    const [[, inserted]] = await redis
      .multi()
      .hsetnx(key, playerId, encodedAnswer)
      .expire(key, ttlSeconds)
      .exec();
    return inserted === 1;
  }

  async function countAnswers(code, index) {
    return redis.hlen(roomKeys(code).answers(index));
  }

  async function getAnswers(code, index) {
    return redis.hgetall(roomKeys(code).answers(index));
  }

  async function hasAnswered(code, index, playerId) {
    return (await redis.hexists(roomKeys(code).answers(index), playerId)) === 1;
  }

  async function getStreaks(code) {
    return redis.hgetall(roomKeys(code).streaks);
  }

  async function applyScores(code, updates) {
    if (updates.length === 0) return;
    const keys = roomKeys(code);
    const pipeline = redis.pipeline();
    for (const { playerId, points, streak, correct } of updates) {
      if (points > 0) pipeline.zincrby(keys.leaderboard, points, playerId);
      pipeline.hset(keys.streaks, playerId, streak);
      if (correct) pipeline.hincrby(keys.correct, playerId, 1);
    }
    for (const key of [keys.leaderboard, keys.streaks, keys.correct]) {
      pipeline.expire(key, ttlSeconds);
    }
    await pipeline.exec();
  }

  async function getStandings(code, playerIds) {
    if (playerIds.length === 0) return {};
    const key = roomKeys(code).leaderboard;
    const pipeline = redis.pipeline();
    for (const playerId of playerIds) {
      pipeline.zscore(key, playerId);
      pipeline.zrevrank(key, playerId);
    }
    const replies = await pipeline.exec();
    return Object.fromEntries(
      playerIds.map((playerId, i) => {
        const score = Number(replies[i * 2][1] ?? 0);
        const rank = replies[i * 2 + 1][1];
        return [playerId, { score, rank: rank === null ? null : Number(rank) + 1 }];
      }),
    );
  }

  async function getTopPlayers(code, limit = 5) {
    const keys = roomKeys(code);
    const entries = toScoreEntries(
      await redis.zrevrange(keys.leaderboard, 0, limit - 1, 'WITHSCORES'),
    );
    if (entries.length === 0) return [];
    const nicknames = await redis.hmget(keys.players, ...entries.map((e) => e.playerId));
    return entries.map((entry, i) => ({ nickname: nicknames[i] ?? 'Player', score: entry.score }));
  }

  async function getFullRanking(code) {
    return toScoreEntries(await redis.zrevrange(roomKeys(code).leaderboard, 0, -1, 'WITHSCORES'));
  }

  async function getCorrectCounts(code) {
    return redis.hgetall(roomKeys(code).correct);
  }

  async function saveQuestionStats(code, index, stats) {
    const key = roomKeys(code).stats;
    await redis
      .multi()
      .hset(key, String(index), JSON.stringify(stats))
      .expire(key, ttlSeconds)
      .exec();
  }

  async function getQuestionStats(code, index) {
    const raw = await redis.hget(roomKeys(code).stats, String(index));
    return raw ? JSON.parse(raw) : null;
  }

  async function getAllQuestionStats(code) {
    const hash = await redis.hgetall(roomKeys(code).stats);
    return Object.values(hash)
      .map((raw) => JSON.parse(raw))
      .sort((a, b) => a.index - b.index);
  }

  async function saveLastResults(code, resultsByPlayer) {
    const entries = Object.entries(resultsByPlayer);
    if (entries.length === 0) return;
    const key = roomKeys(code).results;
    const flat = Object.fromEntries(entries.map(([id, result]) => [id, JSON.stringify(result)]));
    await redis.multi().del(key).hset(key, flat).expire(key, ttlSeconds).exec();
  }

  async function getLastResult(code, playerId) {
    const raw = await redis.hget(roomKeys(code).results, playerId);
    return raw ? JSON.parse(raw) : null;
  }

  async function deleteRoom(code, totalQuestions) {
    const keys = roomKeys(code);
    const answerKeys = Array.from({ length: totalQuestions }, (_, i) => keys.answers(i));
    await redis.del(
      keys.room,
      keys.claim,
      keys.quiz,
      keys.players,
      keys.nicknames,
      keys.tokens,
      keys.online,
      keys.leaderboard,
      keys.streaks,
      keys.correct,
      keys.results,
      keys.stats,
      ...answerKeys,
    );
    questionCache.delete(code);
  }

  return {
    claimRoomCode,
    createRoom,
    getRoom,
    getQuestions,
    transition,
    setHostSocket,
    releaseHostSocket,
    addPlayer,
    findPlayerByToken,
    getNickname,
    getPlayers,
    countPlayers,
    setOnline,
    setOffline,
    getOnline,
    countOnline,
    recordAnswer,
    countAnswers,
    getAnswers,
    hasAnswered,
    getStreaks,
    applyScores,
    getStandings,
    getTopPlayers,
    getFullRanking,
    getCorrectCounts,
    saveQuestionStats,
    getQuestionStats,
    getAllQuestionStats,
    saveLastResults,
    getLastResult,
    deleteRoom,
  };
}
