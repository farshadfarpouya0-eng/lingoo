"use client";

import { useEffect, useState } from "react";

function localInputMin() {
  const date = new Date(Date.now() + 60 * 60_000);
  const minute = date.getMinutes();
  date.setSeconds(0, 0);
  if (minute < 30) date.setMinutes(30, 0, 0);
  else date.setHours(date.getHours() + 1, 0, 0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function inAccountZone(localValue: string, timeZone: string) {
  if (!localValue) return "";
  // datetime-local is a wall-clock value in the browser's own zone.
  const instant = new Date(localValue);
  if (!Number.isFinite(instant.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(instant);
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export default function LiveAssessmentTimeInput({
  id, inputClass, accountTimeZone, minLabel,
}: {
  id: string; inputClass: string; accountTimeZone: string; minLabel: string;
}) {
  const [min, setMin] = useState("");
  const [localValue, setLocalValue] = useState("");
  const [accountValue, setAccountValue] = useState("");

  useEffect(() => { setMin(localInputMin()); }, []);

  return (
    <>
      <input
        id={id}
        type="datetime-local"
        required
        min={min || undefined}
        step={1800}
        className={inputClass}
        value={localValue}
        onChange={e => {
          const next = e.target.value;
          setLocalValue(next);
          setAccountValue(inAccountZone(next, accountTimeZone));
        }}
      />
      <input type="hidden" name="scheduledAt" value={accountValue} />
      <p className="mt-2 text-[11px] leading-5 text-slate-400">
        {minLabel} <b className="text-slate-600">{accountTimeZone}</b>
      </p>
    </>
  );
}
