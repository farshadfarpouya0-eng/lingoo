"use client";

import { useActionState, useState } from "react";
import { markLessonComplete } from "@/lib/lesson-actions";

export default function CompleteLessonButton({ id, disabled, label }: {
  id: number;
  disabled?: boolean;
  label?: string;
}) {
  const [state, action, pending] = useActionState(markLessonComplete, {} as { ok?: boolean; error?: string });
  const [done, setDone] = useState(false);

  const message =
    state.error === "too_early" ? "You can mark this complete after the lesson ends." :
    state.error === "already" ? "This lesson is already completed." :
    state.error ? "Couldn't complete the lesson." : "";

  return (
    <form
      action={action as unknown as (fd: FormData) => Promise<void>}
      onSubmit={() => { if (!disabled) setDone(true); }}
      className="inline-flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending || disabled || state.ok}
        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : state.ok ? "✓ Completed" : (label ?? "Complete lesson")}
      </button>
      {message && !state.ok && <span role="alert" className="text-xs text-amber-700">{message}</span>}
    </form>
  );
}