import { hardestQuestionIndex } from '../game/stats.js';
import { GameResult } from '../models/GameResult.js';
import { Quiz } from '../models/Quiz.js';
import { notFound } from '../utils/httpError.js';

export async function getResult(req, res) {
  const result = await GameResult.findById(req.validated.params.id).lean();
  if (!result) throw notFound('Result not found');

  const quiz = await Quiz.findById(result.quizId, { title: 1, questions: 1 }).lean();
  const questions = quiz?.questions ?? [];

  res.json({
    id: String(result._id),
    quizId: String(result.quizId),
    quizTitle: quiz?.title ?? 'Deleted quiz',
    roomCode: result.roomCode,
    playedAt: result.playedAt,
    players: result.players,
    hardestIndex: hardestQuestionIndex(result.perQuestion),
    perQuestion: result.perQuestion.map((stats) => {
      const question = questions[stats.index];
      return {
        ...stats,
        text: question?.text ?? '',
        options: question?.options ?? [],
        correctIndex: question?.correctIndex ?? null,
      };
    }),
  });
}
