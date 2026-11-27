"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { getPlacementQuestions, GOALS } from "@/lib/placement-questions";
import { submitWrittenAssessment } from "@/lib/assessment-actions";
import type { AssessmentCopy } from "@/lib/assessment-i18n";
import Icon from "./Icon";

export default function PlacementTest({ a, initialGoal, initialAudience }: {
  a: AssessmentCopy; initialGoal: string; initialAudience: string;
}) {
  const [step, setStep] = useState(0); // 0 = goal/audience, 1..N = questions
  const [goal, setGoal] = useState(initialGoal);
  const [audience, setAudience] = useState(initialAudience === "kids" ? "kids" : "adults");
  const questions = getPlacementQuestions(goal);
  const [answers, setAnswers] = useState<number[]>(() => questions.map(() => -1));
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const total = questions.length;
  const qIndex = step - 1;
  const q = step >= 1 ? questions[qIndex] : null;
  const progress = Math.round((step / total) * 100);

  const chip = (on: boolean) =>
    `rounded-full px-4 py-2 text-xs font-semibold transition ${on ? "bg-teal-800 text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-teal-400"}`;

  function submit() {
    setError("");
    startTransition(async () => {
      try {
        const result = await submitWrittenAssessment({ answers, goal, audience });
        if (result?.error) setError(a.completeAnswers);
      } catch (cause) {
        unstable_rethrow(cause);
        setError(a.errGeneric);
      }
    });
  }

  return (
    <div className="rounded-[26px] border border-slate-200 bg-white p-6 sm:p-8">
      {step === 0 ? (
        <div>
          <h2 className="text-xl font-bold text-teal-950">{a.pickGoalFirst}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">{a.testIntro}</p>

          <p className="mt-6 text-xs font-bold uppercase tracking-wider text-slate-400">{a.audienceLabel}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={chip(audience === "adults")} onClick={() => setAudience("adults")}>{a.adults}</button>
            <button type="button" className={chip(audience === "kids")} onClick={() => setAudience("kids")}>{a.kids}</button>
          </div>

          <p className="mt-6 text-xs font-bold uppercase tracking-wider text-slate-400">{a.goalLabel}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={chip(goal === "")} onClick={() => { setGoal(""); setAnswers(getPlacementQuestions("").map(() => -1)); }}>{a.goalAny}</button>
            {GOALS.map(g => (
              <button key={g} type="button" className={chip(goal === g)} onClick={() => { setGoal(g); setAnswers(getPlacementQuestions(g).map(() => -1)); }}>{g}</button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setStep(1)}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-teal-800 px-6 py-3 text-sm font-bold text-white transition hover:bg-teal-900"
          >
            {a.startWritten}<Icon name="arrow" width={16} height={16} />
          </button>
        </div>
      ) : q ? (
        <div>
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
            <span>{a.question} {step} {a.of} {total}</span>
            <span>{q.band}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${progress}%` }} />
          </div>

          <h2 className="mt-6 text-lg font-bold leading-8 text-teal-950 sm:text-xl">{q.prompt}</h2>
          <div className="mt-5 grid gap-3">
            {q.options.map((opt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setAnswers(prev => prev.map((v, j) => (j === qIndex ? i : v)))}
                aria-pressed={answers[qIndex] === i}
                className={`rounded-2xl border px-5 py-3.5 text-left text-sm font-medium transition ${
                  answers[qIndex] === i
                    ? "border-teal-600 bg-teal-50 text-teal-900"
                    : "border-slate-200 bg-white text-slate-600 hover:border-teal-300"
                }`}
              >
                <span className="mr-3 inline-grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">
                  {"ABCD"[i]}
                </span>
                {opt}
              </button>
            ))}
          </div>

          {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

          <div className="mt-7 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep(s => Math.max(0, s - 1))}
              className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-500 transition hover:border-teal-300"
            >
              {a.back}
            </button>
            {step < total ? (
              <button
                type="button"
                disabled={answers[qIndex] < 0}
                onClick={() => setStep(s => s + 1)}
                className="inline-flex items-center gap-2 rounded-full bg-teal-800 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {a.next}<Icon name="arrow" width={15} height={15} />
              </button>
            ) : (
              <button
                type="button"
                disabled={answers[qIndex] < 0 || pending}
                onClick={submit}
                className="inline-flex items-center gap-2 rounded-full bg-teal-800 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending ? "…" : a.submitTest}<Icon name="check" width={15} height={15} />
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
