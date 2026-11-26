import mongoose from 'mongoose';
import { GameResult } from '../models/GameResult.js';
import { Quiz } from '../models/Quiz.js';

export const quizRepository = {
  async getQuiz(quizId) {
    if (!mongoose.isValidObjectId(quizId)) return null;
    const quiz = await Quiz.findById(quizId).lean();
    if (!quiz) return null;
    return {
      id: String(quiz._id),
      title: quiz.title,
      durationSec: quiz.durationSec,
      questions: quiz.questions.map(({ text, options, correctIndex }) => ({
        text,
        options,
        correctIndex,
      })),
    };
  },
};

export const resultRepository = {
  async save({ id, quizId, roomCode, players, perQuestion }) {
    await GameResult.create({ _id: id, quizId, roomCode, players, perQuestion });
  },
};

export function createObjectId() {
  return new mongoose.Types.ObjectId();
}
