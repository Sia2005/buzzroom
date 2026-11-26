import mongoose from 'mongoose';

const playerResultSchema = new mongoose.Schema(
  {
    nickname: { type: String, required: true },
    score: { type: Number, required: true, min: 0 },
    rank: { type: Number, required: true, min: 1 },
    correctCount: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const questionStatsSchema = new mongoose.Schema(
  {
    index: { type: Number, required: true, min: 0 },
    correctPct: { type: Number, required: true, min: 0, max: 100 },
    avgElapsedMs: { type: Number, required: true, min: 0 },
    answerCounts: { type: [Number], required: true },
  },
  { _id: false },
);

const gameResultSchema = new mongoose.Schema({
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true, index: true },
  roomCode: { type: String, required: true },
  playedAt: { type: Date, default: Date.now },
  players: [playerResultSchema],
  perQuestion: [questionStatsSchema],
});

export const GameResult = mongoose.model('GameResult', gameResultSchema);
