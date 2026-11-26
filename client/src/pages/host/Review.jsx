import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { saveQuiz } from '../../api/quizzes.js';
import { OptionShape } from '../../components/OptionShape.jsx';
import {
  Button,
  Card,
  ErrorMessage,
  FullScreenMessage,
  LinkButton,
  Logo,
} from '../../components/ui.jsx';
import { request } from '../../hooks/useSocket.js';
import { OPTION_STYLES } from '../../lib/options.js';
import { loadDraft, saveDraft, saveSession } from '../../lib/session.js';

const REASON_LABELS = {
  evidence_not_in_source: 'Evidence not found in your notes',
  evidence_too_short: 'Evidence too short to prove the answer',
  answer_not_supported_by_evidence: 'Correct answer not supported by its evidence',
  duplicate: 'Duplicate of another question',
};

function describeReason(reason) {
  if (REASON_LABELS[reason]) return REASON_LABELS[reason];
  if (reason.startsWith('invalid_shape')) return 'Malformed question';
  return reason;
}

function questionProblem(question) {
  const text = question.text.trim();
  if (text.length < 10 || text.length > 200) return 'Question must be 10 to 200 characters.';
  const options = question.options.map((option) => option.trim());
  if (options.some((option) => !option)) return 'Fill in all four options.';
  if (new Set(options.map((option) => option.toLowerCase())).size !== 4) {
    return 'Options must all be different.';
  }
  return '';
}

const blankQuestion = () => ({
  text: '',
  options: ['', '', '', ''],
  correctIndex: 0,
  evidence: '',
});

function ReportPanel({ report }) {
  if (!report) return null;
  const stats = [
    ['Generated', report.generated],
    ['Valid format', report.passedSchema],
    ['Grounded in notes', report.passedGrounding],
    ['Kept', report.kept],
  ];
  return (
    <Card>
      <h2 className="font-semibold text-slate-900">Generation report</h2>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-slate-50 px-4 py-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className="text-2xl font-bold tabular-nums text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
      {report.kept < report.requested && (
        <p className="mt-4 text-sm text-amber-800">
          Only {report.kept} of the {report.requested} requested questions passed every check. You
          can add your own below.
        </p>
      )}
      {report.truncatedSource && (
        <p className="mt-2 text-sm text-slate-600">
          Your source was long, so only the first part was used.
        </p>
      )}
      {report.rejected.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">
            {report.rejected.length} rejected question{report.rejected.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {report.rejected.map((item, index) => (
              <li key={index} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="font-semibold text-rose-700">{describeReason(item.reason)}</span>
                {item.question && <span className="block text-slate-600">{item.question}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function QuestionEditor({ question, index, showErrors, onChange, onDelete }) {
  const problem = showErrors ? questionProblem(question) : '';
  const update = (patch) => onChange({ ...question, ...patch });
  const updateOption = (optionIndex, value) =>
    update({ options: question.options.map((option, i) => (i === optionIndex ? value : option)) });

  return (
    <Card className={problem ? 'ring-rose-300' : ''}>
      <div className="flex items-start justify-between gap-4">
        <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-sm font-bold text-white">
          Q{index + 1}
        </span>
        <Button variant="danger" size="sm" onClick={onDelete}>
          Delete
        </Button>
      </div>

      <label className="mt-4 flex flex-col gap-1">
        <span className="sr-only">Question text</span>
        <textarea
          value={question.text}
          onChange={(event) => update({ text: event.target.value })}
          rows={2}
          maxLength={200}
          placeholder="Question"
          className="rounded-xl border border-slate-300 px-4 py-2.5 text-lg font-semibold focus:border-slate-900 focus:outline-none"
        />
      </label>

      <fieldset className="mt-4 grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">Options. Select the correct answer.</legend>
        {question.options.map((option, optionIndex) => {
          const style = OPTION_STYLES[optionIndex];
          const isCorrect = question.correctIndex === optionIndex;
          return (
            <div
              key={style.letter}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${isCorrect ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.base}`}
              >
                <OptionShape shape={style.shape} className="h-4 w-4" />
              </span>
              <input
                value={option}
                onChange={(event) => updateOption(optionIndex, event.target.value)}
                maxLength={120}
                placeholder={`Option ${style.letter}`}
                aria-label={`Option ${style.letter}`}
                className="min-w-0 flex-1 bg-transparent py-1 focus:outline-none"
              />
              <label className="flex shrink-0 items-center gap-1 text-xs font-semibold text-slate-600">
                <input
                  type="radio"
                  name={`correct-${index}`}
                  checked={isCorrect}
                  onChange={() => update({ correctIndex: optionIndex })}
                  className="accent-emerald-600"
                />
                Correct
              </label>
            </div>
          );
        })}
      </fieldset>

      {question.evidence && (
        <p className="mt-4 border-l-4 border-slate-200 pl-3 text-sm italic text-slate-500">
          {question.evidence}
        </p>
      )}
      {problem && <p className="mt-3 text-sm font-medium text-rose-700">{problem}</p>}
    </Card>
  );
}

export default function Review() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(loadDraft);
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    if (draft) saveDraft(draft);
  }, [draft]);

  if (!draft) {
    return (
      <FullScreenMessage
        title="Nothing to review"
        action={<LinkButton to="/host">Create a quiz</LinkButton>}
      >
        Generate questions from your notes first.
      </FullScreenMessage>
    );
  }

  const edit = (patch) => setDraft((current) => ({ ...current, ...patch, savedQuizId: null }));
  const updateQuestion = (index, question) =>
    edit({ questions: draft.questions.map((q, i) => (i === index ? question : q)) });
  const deleteQuestion = (index) =>
    edit({ questions: draft.questions.filter((_, i) => i !== index) });

  async function handleSave() {
    setShowErrors(true);
    setError('');
    if (!draft.title.trim()) return setError('Give your quiz a title.');
    if (draft.questions.length === 0) return setError('Keep at least one question.');
    if (draft.questions.some(questionProblem)) return setError('Fix the highlighted questions.');

    setSaving(true);
    try {
      const { id } = await saveQuiz({
        title: draft.title.trim(),
        sourceType: draft.sourceType,
        durationSec: draft.durationSec,
        questions: draft.questions.map(({ text, options, correctIndex, evidence }) => ({
          text: text.trim(),
          options: options.map((option) => option.trim()),
          correctIndex,
          evidence: evidence ?? '',
        })),
      });
      setDraft((current) => ({ ...current, savedQuizId: id }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleHostLive() {
    setError('');
    setLaunching(true);
    const response = await request('host:create', { quizId: draft.savedQuizId });
    setLaunching(false);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    saveSession('host', { code: response.code, hostToken: response.hostToken });
    navigate(`/host/lobby/${response.code}`);
  }

  const saved = Boolean(draft.savedQuizId);

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-4">
          <Logo to="/host" />
          <div className="flex items-center gap-2">
            {saved ? (
              <Button variant="accent" onClick={handleHostLive} loading={launching}>
                Host live
              </Button>
            ) : (
              <Button onClick={handleSave} loading={saving}>
                Save quiz
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Review questions</h1>
          <p className="mt-2 text-slate-600">
            Fix anything that looks off, delete weak questions, then save and go live.
          </p>
        </div>

        <ErrorMessage>{error}</ErrorMessage>
        {saved && (
          <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200">
            Quiz saved. Click Host live to open a room. Editing again will require another save.
          </p>
        )}

        <ReportPanel report={draft.report} />

        <Card className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate-700">Title</span>
            <input
              value={draft.title}
              onChange={(event) => edit({ title: event.target.value })}
              maxLength={120}
              className="rounded-xl border border-slate-300 px-4 py-2.5 focus:border-slate-900 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate-700">Seconds per question</span>
            <input
              type="number"
              min={10}
              max={60}
              value={draft.durationSec}
              onChange={(event) =>
                edit({ durationSec: Math.min(60, Math.max(10, Number(event.target.value) || 20)) })
              }
              className="w-32 rounded-xl border border-slate-300 px-4 py-2.5 focus:border-slate-900 focus:outline-none"
            />
          </label>
        </Card>

        {draft.questions.length === 0 && (
          <Card className="text-center text-slate-600">
            No questions left. Add one below or generate again.
          </Card>
        )}

        {draft.questions.map((question, index) => (
          <QuestionEditor
            key={index}
            index={index}
            question={question}
            showErrors={showErrors}
            onChange={(next) => updateQuestion(index, next)}
            onDelete={() => deleteQuestion(index)}
          />
        ))}

        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={() => edit({ questions: [...draft.questions, blankQuestion()] })}
            disabled={draft.questions.length >= 30}
          >
            Add question
          </Button>
          <LinkButton to="/host" variant="ghost">
            Start over
          </LinkButton>
        </div>
      </main>
    </div>
  );
}
