import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { generateQuiz } from '../../api/quizzes.js';
import { Button, Card, ErrorMessage, Logo } from '../../components/ui.jsx';
import { saveDraft } from '../../lib/session.js';

const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MIN_TEXT = 200;

function SourceTab({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
    >
      {children}
    </button>
  );
}

export default function Create() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState('pdf');
  const [file, setFile] = useState(null);
  const [text, setText] = useState('');
  const [count, setCount] = useState(10);
  const [durationSec, setDurationSec] = useState(20);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleFile(event) {
    const selected = event.target.files?.[0] ?? null;
    setError('');
    if (selected && selected.size > MAX_PDF_BYTES) {
      setError('PDF must be 5 MB or smaller.');
      setFile(null);
      event.target.value = '';
      return;
    }
    setFile(selected);
  }

  function validate() {
    if (mode === 'pdf' && !file) return 'Choose a PDF to upload.';
    if (mode === 'text' && text.trim().length < MIN_TEXT) {
      return `Paste at least ${MIN_TEXT} characters of notes.`;
    }
    return '';
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    setError('');
    setLoading(true);
    try {
      const result = await generateQuiz({
        file: mode === 'pdf' ? file : null,
        text: mode === 'text' ? text : undefined,
        count,
      });
      const fallbackTitle = mode === 'pdf' ? file.name.replace(/\.pdf$/i, '') : 'Untitled quiz';
      saveDraft({
        title: (title.trim() || fallbackTitle).slice(0, 120),
        sourceType: result.sourceType,
        durationSec,
        questions: result.questions,
        report: result.report,
        savedQuizId: null,
      });
      navigate('/host/review');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
        <Logo />
        <Link to="/" className="text-sm font-medium text-slate-500 hover:text-slate-900">
          Join a game
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-16">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Create a quiz</h1>
        <p className="mt-2 text-slate-600">
          Upload your notes and Buzzroom drafts multiple-choice questions you can review before
          going live.
        </p>

        <form onSubmit={handleSubmit} className="mt-8">
          <Card className="flex flex-col gap-6">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-slate-700">Quiz title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={120}
                placeholder="Cell biology, chapter 3"
                className="rounded-xl border border-slate-300 px-4 py-2.5 focus:border-slate-900 focus:outline-none"
              />
            </label>

            <div className="flex flex-col gap-3">
              <span className="text-sm font-semibold text-slate-700">Source material</span>
              <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
                <SourceTab active={mode === 'pdf'} onClick={() => setMode('pdf')}>
                  Upload PDF
                </SourceTab>
                <SourceTab active={mode === 'text'} onClick={() => setMode('text')}>
                  Paste text
                </SourceTab>
              </div>

              {mode === 'pdf' ? (
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-6 py-10 text-center hover:border-slate-400">
                  <span className="font-semibold text-slate-900">
                    {file ? file.name : 'Choose a PDF'}
                  </span>
                  <span className="text-sm text-slate-500">
                    {file
                      ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
                      : 'Text-based PDF, up to 5 MB'}
                  </span>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={handleFile}
                    className="sr-only"
                  />
                </label>
              ) : (
                <div className="flex flex-col gap-1">
                  <textarea
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    rows={10}
                    placeholder="Paste lecture notes, an article or a chapter here."
                    className="rounded-xl border border-slate-300 px-4 py-3 focus:border-slate-900 focus:outline-none"
                  />
                  <span className="self-end text-xs text-slate-500 tabular-nums">
                    {text.length.toLocaleString()} characters
                  </span>
                </div>
              )}
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="flex justify-between text-sm font-semibold text-slate-700">
                  Questions <span className="tabular-nums">{count}</span>
                </span>
                <input
                  type="range"
                  min={5}
                  max={15}
                  value={count}
                  onChange={(event) => setCount(Number(event.target.value))}
                  className="accent-slate-900"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="flex justify-between text-sm font-semibold text-slate-700">
                  Time per question <span className="tabular-nums">{durationSec}s</span>
                </span>
                <input
                  type="range"
                  min={10}
                  max={60}
                  step={5}
                  value={durationSec}
                  onChange={(event) => setDurationSec(Number(event.target.value))}
                  className="accent-slate-900"
                />
              </label>
            </div>

            <ErrorMessage>{error}</ErrorMessage>

            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                {loading ? 'Reading your notes and checking every answer against them.' : ''}
              </p>
              <Button type="submit" size="lg" loading={loading}>
                {loading ? 'Generating' : 'Generate questions'}
              </Button>
            </div>
          </Card>
        </form>
      </main>
    </div>
  );
}
