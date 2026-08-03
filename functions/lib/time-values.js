"use strict";

function timestampMillis(value, fallback = Date.now()) {
  if (value === null || value === undefined || value === "") return Number(fallback);
  if (typeof value.toMillis === "function") {
    const ms = Number(value.toMillis());
    return Number.isFinite(ms) ? ms : Number(fallback);
  }
  if (typeof value.toDate === "function") {
    const date = value.toDate();
    const ms = date instanceof Date ? date.getTime() : Number.NaN;
    return Number.isFinite(ms) ? ms : Number(fallback);
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : Number(fallback);
  }
  if (typeof value === "object" && (value.seconds !== undefined || value._seconds !== undefined)) {
    const seconds = Number(value.seconds ?? value._seconds);
    const nanos = Number(value.nanoseconds ?? value._nanoseconds ?? 0);
    const ms = seconds * 1000 + Math.floor(nanos / 1e6);
    return Number.isFinite(ms) ? ms : Number(fallback);
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : Number(fallback);
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : Number(fallback);
}

function firestoreTimestamp(value, Timestamp, fallback = Date.now()) {
  if (value && typeof value.toMillis === "function") return value;
  return Timestamp.fromMillis(timestampMillis(value, fallback));
}

module.exports = { timestampMillis, firestoreTimestamp };
