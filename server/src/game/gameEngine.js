import { generatePlayerId, generateToken, tokensMatch } from '../utils/tokens.js';
import { nicknameKey } from '../validation/common.js';
import { ERROR_CODES, GameError } from './errors.js';
import { JOIN_RESULT } from './roomStore.js';
import { NETWORK_GRACE_MS, isWithinAnswerWindow, scoreAnswer } from './scoring.js';
import { STATES, assertEventAllowed, nextStateAfterLeaderboard } from './stateMachine.js';
import {
  buildRanking,
  decodeAnswer,
  encodeAnswer,
  tallyAnswers,
  toQuestionStats,
} from './stats.js';

const LEADERBOARD_SIZE = 5;
const PODIUM_SIZE = 3;
const LOBBY_BROADCAST_INTERVAL_MS = 200;

const JOIN_ERRORS = {
  [JOIN_RESULT.NICKNAME_TAKEN]: ['That nickname is taken in this room', ERROR_CODES.NICKNAME_TAKEN],
  [JOIN_RESULT.NOT_IN_LOBBY]: ['This game has already started', ERROR_CODES.GAME_STARTED],
  [JOIN_RESULT.ROOM_FULL]: ['This room is full', ERROR_CODES.ROOM_FULL],
  [JOIN_RESULT.ROOM_NOT_FOUND]: ['Room not found. Check the code.', ERROR_CODES.ROOM_NOT_FOUND],
};

export const channels = {
  room: (code) => `room:${code}`,
  host: (code) => `room:${code}:host`,
};

export function createGameEngine({
  io,
  store,
  quizzes,
  results,
  logger,
  revealMs = 4000,
  now = Date.now,
  createResultId,
}) {
  const phaseTimers = new Map();
  const lobbyTimers = new Map();

  function schedule(code, delayMs, task) {
    clearPhaseTimer(code);
    const timer = setTimeout(() => {
      phaseTimers.delete(code);
      Promise.resolve()
        .then(task)
        .catch((error) => logger.error('Scheduled game task failed', { code, error }));
    }, delayMs);
    phaseTimers.set(code, timer);
  }

  function clearPhaseTimer(code) {
    const timer = phaseTimers.get(code);
    if (!timer) return;
    clearTimeout(timer);
    phaseTimers.delete(code);
  }

  async function requireRoom(code) {
    const room = await store.getRoom(code);
    if (!room) throw new GameError('Room not found. Check the code.', ERROR_CODES.ROOM_NOT_FOUND);
    return room;
  }

  async function authorizeHost(code, hostToken) {
    const room = await requireRoom(code);
    if (!tokensMatch(room.hostToken, hostToken)) {
      throw new GameError('Only the host can do that', ERROR_CODES.UNAUTHORIZED);
    }
    return room;
  }

  async function attachHost(socket, code) {
    socket.data.role = 'host';
    socket.data.code = code;
    await socket.join([channels.room(code), channels.host(code)]);
    await store.setHostSocket(code, socket.id);
  }

  async function attachPlayer(socket, code, playerId) {
    socket.data.role = 'player';
    socket.data.code = code;
    socket.data.playerId = playerId;
    await socket.join(channels.room(code));
  }

  function scheduleLobbyBroadcast(code) {
    if (lobbyTimers.has(code)) return;
    const timer = setTimeout(() => {
      lobbyTimers.delete(code);
      broadcastLobby(code).catch((error) =>
        logger.error('Lobby broadcast failed', { code, error }),
      );
    }, LOBBY_BROADCAST_INTERVAL_MS);
    lobbyTimers.set(code, timer);
  }

  async function lobbyPayload(code) {
    const [players, online] = await Promise.all([store.getPlayers(code), store.getOnline(code)]);
    const nicknames = Object.values(players);
    return { players: nicknames, count: nicknames.length, onlineCount: Object.keys(online).length };
  }

  async function broadcastLobby(code) {
    const room = await store.getRoom(code);
    if (!room || room.state !== STATES.LOBBY) return;
    io.to(channels.room(code)).emit('lobby:update', await lobbyPayload(code));
  }

  function publicQuestion(question, index, room) {
    return {
      index,
      total: room.total,
      text: question.text,
      options: question.options,
      durationMs: room.durationMs,
      serverTime: room.questionStartedAt,
    };
  }

  async function createRoom(socket, { quizId }) {
    const quiz = await quizzes.getQuiz(quizId);
    if (!quiz || quiz.questions.length === 0) {
      throw new GameError('Quiz not found', ERROR_CODES.QUIZ_NOT_FOUND);
    }

    const code = await store.claimRoomCode();
    const hostToken = generateToken();
    await store.createRoom({
      code,
      quizId: String(quizId),
      hostToken,
      questions: quiz.questions,
      durationMs: quiz.durationSec * 1000,
    });
    await attachHost(socket, code);
    logger.info('Room created', { code, quizId: String(quizId) });
    return { code, hostToken };
  }

  async function rejoinHost(socket, { code, hostToken }) {
    const room = await authorizeHost(code, hostToken);
    assertEventAllowed(room.state, 'host:rejoin');
    await attachHost(socket, code);
    io.to(channels.room(code)).emit('host:status', { online: true });
    return { snapshot: await buildSnapshot(code, { role: 'host' }) };
  }

  async function startGame(socket, { code, hostToken }) {
    const room = await authorizeHost(code, hostToken);
    assertEventAllowed(room.state, 'host:start');
    if ((await store.countPlayers(code)) === 0) {
      throw new GameError('Wait for at least one player to join', ERROR_CODES.NO_PLAYERS);
    }
    clearTimeout(lobbyTimers.get(code));
    lobbyTimers.delete(code);
    await startQuestion(code, room, 0);
    return { started: true };
  }

  async function nextQuestion(socket, { code, hostToken }) {
    const room = await authorizeHost(code, hostToken);
    assertEventAllowed(room.state, 'host:next');
    if (nextStateAfterLeaderboard(room.currentIndex, room.total) === STATES.ENDED) {
      await endGame(code, room);
      return { ended: true };
    }
    await startQuestion(code, room, room.currentIndex + 1);
    return { ended: false };
  }

  async function startQuestion(code, room, index) {
    const questions = await store.getQuestions(code);
    const question = questions?.[index];
    if (!question) throw new GameError('Question not found', ERROR_CODES.INTERNAL);

    const startedAt = now();
    const moved = await store.transition(code, room.state, STATES.QUESTION, {
      fields: { currentIndex: index, questionStartedAt: startedAt },
    });
    if (!moved) throw new GameError('The game already moved on', ERROR_CODES.NOT_ALLOWED);

    const live = { ...room, currentIndex: index, questionStartedAt: startedAt };
    io.to(channels.room(code)).emit('question:show', publicQuestion(question, index, live));
    io.to(channels.host(code)).emit('answer:progress', {
      index,
      answered: 0,
      expected: await store.countOnline(code),
    });
    schedule(code, room.durationMs + NETWORK_GRACE_MS, () => endQuestion(code, index));
  }

  async function submitAnswer(socket, { code, questionIndex, choice }, receivedAt) {
    const { role, playerId } = socket.data;
    if (role !== 'player' || socket.data.code !== code) {
      throw new GameError('Join the room before answering', ERROR_CODES.UNAUTHORIZED);
    }

    const room = await requireRoom(code);
    assertEventAllowed(room.state, 'player:answer');
    if (questionIndex !== room.currentIndex) {
      throw new GameError('That question is no longer active', ERROR_CODES.WRONG_QUESTION);
    }
    const startedAt = room.questionStartedAt;
    if (!isWithinAnswerWindow({ receivedAt, startedAt, durationMs: room.durationMs })) {
      throw new GameError('Time is up for this question', ERROR_CODES.TOO_LATE);
    }

    const elapsedMs = Math.min(receivedAt - startedAt, room.durationMs);
    const recorded = await store.recordAnswer(
      code,
      questionIndex,
      playerId,
      encodeAnswer(choice, elapsedMs),
    );
    if (!recorded) {
      throw new GameError('You already answered this question', ERROR_CODES.ALREADY_ANSWERED);
    }

    await checkQuestionComplete(code, questionIndex);
    return { accepted: true };
  }

  async function checkQuestionComplete(code, index) {
    const [answered, expected] = await Promise.all([
      store.countAnswers(code, index),
      store.countOnline(code),
    ]);
    io.to(channels.host(code)).emit('answer:progress', { index, answered, expected });
    if (expected === 0 || answered < expected) return;

    const [online, answers] = await Promise.all([
      store.getOnline(code),
      store.getAnswers(code, index),
    ]);
    const everyoneAnswered = Object.keys(online).every((id) => Object.hasOwn(answers, id));
    if (everyoneAnswered) await endQuestion(code, index);
  }

  async function endQuestion(code, index) {
    const moved = await store.transition(code, STATES.QUESTION, STATES.REVEAL, {
      guard: { field: 'currentIndex', value: index },
    });
    if (!moved) return;
    clearPhaseTimer(code);

    const room = await store.getRoom(code);
    const [questions, players, answers, streaks, online] = await Promise.all([
      store.getQuestions(code),
      store.getPlayers(code),
      store.getAnswers(code, index),
      store.getStreaks(code),
      store.getOnline(code),
    ]);
    const { correctIndex } = questions[index];
    const playerIds = Object.keys(players);

    const outcomes = playerIds.map((playerId) => {
      const answer = decodeAnswer(answers[playerId]);
      const correct = answer?.choice === correctIndex;
      const score = scoreAnswer({
        correct,
        elapsedMs: answer?.elapsedMs ?? room.durationMs,
        durationMs: room.durationMs,
        previousStreak: Number(streaks[playerId] ?? 0),
      });
      return {
        playerId,
        answered: Boolean(answer),
        choice: answer?.choice ?? null,
        correct,
        ...score,
      };
    });

    await store.applyScores(code, outcomes);
    const tally = tallyAnswers(answers, correctIndex);
    await store.saveQuestionStats(code, index, toQuestionStats(index, tally, playerIds.length));

    io.to(channels.room(code)).emit('question:end', {
      index,
      correctIndex,
      answerCounts: tally.answerCounts,
    });

    const standings = await store.getStandings(code, playerIds);
    const resultsByPlayer = {};
    for (const outcome of outcomes) {
      const standing = standings[outcome.playerId];
      const result = {
        index,
        answered: outcome.answered,
        choice: outcome.choice,
        correct: outcome.correct,
        points: outcome.points,
        bonus: outcome.bonus,
        streak: outcome.streak,
        totalScore: standing.score,
        rank: standing.rank,
        playerCount: playerIds.length,
      };
      resultsByPlayer[outcome.playerId] = result;
      const socketId = online[outcome.playerId];
      if (socketId) io.to(socketId).emit('answer:result', result);
    }
    await store.saveLastResults(code, resultsByPlayer);

    schedule(code, revealMs, () => showLeaderboard(code, index));
  }

  async function leaderboardPayload(code, room) {
    return {
      index: room.currentIndex,
      total: room.total,
      isLastQuestion: room.currentIndex + 1 >= room.total,
      top: await store.getTopPlayers(code, LEADERBOARD_SIZE),
    };
  }

  async function showLeaderboard(code, index) {
    const moved = await store.transition(code, STATES.REVEAL, STATES.LEADERBOARD, {
      guard: { field: 'currentIndex', value: index },
    });
    if (!moved) return;
    const room = await store.getRoom(code);
    io.to(channels.room(code)).emit('leaderboard:update', await leaderboardPayload(code, room));
  }

  async function endGame(code, room) {
    const moved = await store.transition(code, STATES.LEADERBOARD, STATES.ENDED);
    if (!moved) throw new GameError('The game already moved on', ERROR_CODES.NOT_ALLOWED);
    clearPhaseTimer(code);

    const [entries, players, correctCounts, perQuestion] = await Promise.all([
      store.getFullRanking(code),
      store.getPlayers(code),
      store.getCorrectCounts(code),
      store.getAllQuestionStats(code),
    ]);
    const ranking = buildRanking(entries, players, correctCounts);
    const resultId = String(createResultId());

    io.to(channels.room(code)).emit('game:over', {
      resultId,
      podium: ranking.slice(0, PODIUM_SIZE),
      ranking,
    });

    try {
      await results.save({
        id: resultId,
        quizId: room.quizId,
        roomCode: code,
        players: ranking,
        perQuestion,
      });
    } catch (error) {
      logger.error('Failed to save game result', { code, error });
    }

    await store.deleteRoom(code, room.total);
    io.in(channels.room(code)).socketsLeave(channels.room(code));
    io.in(channels.host(code)).socketsLeave(channels.host(code));
    logger.info('Game ended', { code, players: ranking.length });
  }

  async function joinPlayer(socket, { code, nickname }) {
    const playerId = generatePlayerId();
    const playerToken = generateToken();
    const result = await store.addPlayer(code, {
      playerId,
      nickname,
      nicknameKey: nicknameKey(nickname),
      playerToken,
      socketId: socket.id,
    });
    if (result !== JOIN_RESULT.OK) {
      const [message, errorCode] = JOIN_ERRORS[result] ?? ['Could not join', ERROR_CODES.INTERNAL];
      throw new GameError(message, errorCode);
    }

    await attachPlayer(socket, code, playerId);
    scheduleLobbyBroadcast(code);
    return { playerId, playerToken, nickname };
  }

  async function rejoinPlayer(socket, { code, playerToken }) {
    const room = await requireRoom(code);
    assertEventAllowed(room.state, 'player:rejoin');
    const playerId = await store.findPlayerByToken(code, playerToken);
    if (!playerId) {
      throw new GameError('Your session for this room has expired', ERROR_CODES.UNAUTHORIZED);
    }

    await store.setOnline(code, playerId, socket.id);
    await attachPlayer(socket, code, playerId);
    if (room.state === STATES.LOBBY) scheduleLobbyBroadcast(code);
    return { snapshot: await buildSnapshot(code, { role: 'player', playerId }) };
  }

  async function handleDisconnect(socket) {
    const { role, code, playerId } = socket.data;
    if (!code) return;

    if (role === 'host') {
      const released = await store.releaseHostSocket(code, socket.id);
      if (released) io.to(channels.room(code)).emit('host:status', { online: false });
      return;
    }

    if (role !== 'player') return;
    const wentOffline = await store.setOffline(code, playerId, socket.id);
    if (!wentOffline) return;

    const room = await store.getRoom(code);
    if (!room) return;
    if (room.state === STATES.LOBBY) scheduleLobbyBroadcast(code);
    if (room.state === STATES.QUESTION) await checkQuestionComplete(code, room.currentIndex);
  }

  async function buildSnapshot(code, { role, playerId }) {
    const room = await requireRoom(code);
    const snapshot = {
      code,
      role,
      state: room.state,
      total: room.total,
      currentIndex: room.currentIndex,
      durationMs: room.durationMs,
      hostOnline: room.hostOnline,
      serverNow: now(),
      lobby: null,
      question: null,
      remainingMs: 0,
      reveal: null,
      leaderboard: null,
      progress: null,
      me: null,
    };

    if (room.state === STATES.LOBBY) snapshot.lobby = await lobbyPayload(code);

    const hasQuestion = room.state !== STATES.LOBBY && room.currentIndex >= 0;
    if (hasQuestion) {
      const questions = await store.getQuestions(code);
      const question = questions[room.currentIndex];
      snapshot.question = publicQuestion(question, room.currentIndex, room);

      if (room.state === STATES.QUESTION) {
        snapshot.remainingMs = Math.max(
          0,
          room.questionStartedAt + room.durationMs - snapshot.serverNow,
        );
        if (role === 'host') {
          const [answered, expected] = await Promise.all([
            store.countAnswers(code, room.currentIndex),
            store.countOnline(code),
          ]);
          snapshot.progress = { index: room.currentIndex, answered, expected };
        }
      } else {
        const stats = await store.getQuestionStats(code, room.currentIndex);
        snapshot.reveal = {
          index: room.currentIndex,
          correctIndex: question.correctIndex,
          answerCounts: stats?.answerCounts ?? [0, 0, 0, 0],
        };
      }
    }

    if (room.state === STATES.LEADERBOARD) {
      snapshot.leaderboard = await leaderboardPayload(code, room);
    }

    if (role === 'player') {
      const [nickname, standings, answered, lastResult] = await Promise.all([
        store.getNickname(code, playerId),
        store.getStandings(code, [playerId]),
        hasQuestion ? store.hasAnswered(code, room.currentIndex, playerId) : false,
        hasQuestion && room.state !== STATES.QUESTION ? store.getLastResult(code, playerId) : null,
      ]);
      snapshot.me = {
        playerId,
        nickname,
        score: standings[playerId]?.score ?? 0,
        rank: standings[playerId]?.rank ?? null,
        answered,
        lastResult,
      };
    }

    return snapshot;
  }

  function shutdown() {
    for (const timer of phaseTimers.values()) clearTimeout(timer);
    for (const timer of lobbyTimers.values()) clearTimeout(timer);
    phaseTimers.clear();
    lobbyTimers.clear();
  }

  return {
    createRoom,
    rejoinHost,
    startGame,
    nextQuestion,
    submitAnswer,
    joinPlayer,
    rejoinPlayer,
    handleDisconnect,
    shutdown,
  };
}
