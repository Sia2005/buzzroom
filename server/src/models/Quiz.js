import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true, minlength: 10, maxlength: 200 },
    options: {
      type: [{ type: String, required: true, trim: true, maxlength: 120 }],
      validate: {
        validator: (options) => options.length === 4,
        message: 'A question needs exactly 4 options',
      },
    },
    correctIndex: { type: Number, required: true, min: 0, max: 3 },
    evidence: { type: String, default: '', trim: true, maxlength: 1000 },
  },
  { _id: false },
);

const quizSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    sourceType: { type: String, enum: ['pdf', 'text'], required: true },
    durationSec: { type: Number, min: 10, max: 60, default: 20 },
    questions: {
      type: [questionSchema],
      validate: {
        validator: (questions) => questions.length >= 1 && questions.length <= 30,
        message: 'A quiz needs between 1 and 30 questions',
      },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const Quiz = mongoose.model('Quiz', quizSchema);
