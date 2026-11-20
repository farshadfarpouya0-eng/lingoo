"use client";

import { useActionState, useState } from "react";
import { markLessonComplete } from "@/lib/lesson-actions";

/**
 * The tutor's "End lesson" button. Ending the lesson settles it in the same
 * transaction: the platform releases the held payment and the tutor's share
 * lands in their wallet immediately (see payTeacher in lib/money).
 */
export default function CompleteLessonButton({ id, disabled, label, earnLabel }: {
  id: number;
  disabled?: boolean;
  label?: string;
  earnLabel?: string;
}) {
  const [state, action, pending] = useActionState(markLessonComplete, {} as { ok?: boolean; error?: string });
  const [done, setDone] = useState(false);

  const message =
    state.error === "too_early" ? "You can end the lesson once it has started." :
    state.error === "already" ? "This lesson is already completed." :
    state.error ? "Couldn't complete the lesson." : "";

  if (state.ok) {
    return (
      <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700">
        ✓ Lesson ended{earnLabel ? ` · ${earnLabel} paid to your wallet` : ""}
      </span>
    );
  }

  return (
    <form
      action={action as unknown as (fd: FormData) => Promise<void>}
      onSubmit={() => { if (!disabled) setDone(true); }}
      className="flex w-full flex-wrap items-center gap-2 sm:inline-flex sm:w-auto"
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending || disabled || state.ok}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50 sm:w-auto"
      >
        {pending ? "Paying…" : (label ?? "End lesson")}
      </button>
      {message && !state.ok && <span role="alert" className="text-xs text-amber-700">{message}</span>}
    </form>
  );
}
