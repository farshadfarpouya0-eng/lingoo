import { types } from "pg";

/**
 * Fix how `timestamp without time zone` columns are read.
 *
 * Drizzle writes JS Dates as UTC wall time (Date.toISOString()), but node-postgres
 * parses `timestamp` columns back using the SERVER'S LOCAL TIMEZONE. Any machine
 * ahead of UTC therefore sees every lesson start/end shifted backwards — lessons
 * look "already finished" hours before they actually are.
 *
 * Re-parse those columns as UTC so JavaScript and PostgreSQL agree on the same
 * instant. `timestamptz` (1184) is already correct and is left alone.
 */
const TIMESTAMP_OID = 1114;
const TIMESTAMPTZ_OID = 1184;

const hasZone = /(Z|[+-]\d{2}:?\d{2})$/;

function asUtcDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  // "2026-10-22 01:00:00[.123456]" -> "2026-10-22T01:00:00[.123456]Z"
  const iso = value.replace(" ", "T");
  return new Date(hasZone.test(iso) ? iso : `${iso}Z`);
}

types.setTypeParser(TIMESTAMP_OID, asUtcDate as unknown as (value: string) => unknown);
types.setTypeParser(TIMESTAMPTZ_OID, (value: string) => new Date(value));