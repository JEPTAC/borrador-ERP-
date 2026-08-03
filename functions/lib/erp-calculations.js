"use strict";

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateAvailability(balances, reservations) {
  const onHand = (balances || []).reduce((sum, item) => {
    const status = String(item.stockStatus || "AVAILABLE");
    return sum + (status === "AVAILABLE" ? number(item.quantity) : 0);
  }, 0);

  const reserved = (reservations || []).reduce((sum, item) => {
    const status = String(item.status || "");
    if (!["ACTIVE", "PARTIAL"].includes(status)) return sum;
    return sum + Math.max(0, number(item.quantity) - number(item.consumedQuantity));
  }, 0);

  return { onHand, reserved, available: onHand - reserved };
}

function calculateNetRequirement({ grossDemand, onHand, reserved, safetyStock, maxQty, reorderPoint }) {
  const available = number(onHand) - number(reserved);
  const netRequirement = Math.max(0, number(grossDemand) + number(safetyStock) - available);
  const target = number(maxQty);
  const threshold = number(reorderPoint || safetyStock);
  const topUp = target > 0 && available < threshold ? Math.max(0, target - available) : 0;
  return {
    available,
    netRequirement,
    proposedQty: Math.max(netRequirement, topUp),
  };
}

function toMillis(value) {
  if (value == null) return NaN;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === "function") return value.toMillis();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function calculateBusinessMinutes(startValue, endValue, calendar = {}) {
  const start = toMillis(startValue);
  const end = toMillis(endValue);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  const offset = number(calendar.utcOffsetMinutes == null ? -300 : calendar.utcOffsetMinutes);
  const offsetMs = offset * 60000;
  const workdays = new Set(calendar.workdays || [1, 2, 3, 4, 5]);
  const holidays = new Set(calendar.holidays || []);
  const windows = calendar.windows || [[420, 720], [820, 1050]];
  const localStart = start + offsetMs;
  const localEnd = end + offsetMs;
  let day = Math.floor(localStart / 86400000) * 86400000;
  const lastDay = Math.floor(localEnd / 86400000) * 86400000;
  let totalMs = 0;
  while (day <= lastDay) {
    const localDate = new Date(day);
    const dateKey = localDate.toISOString().slice(0, 10);
    const weekday = localDate.getUTCDay();
    if (workdays.has(weekday) && !holidays.has(dateKey)) {
      for (const window of windows) {
        const windowStartUtc = day + number(window[0]) * 60000 - offsetMs;
        const windowEndUtc = day + number(window[1]) * 60000 - offsetMs;
        totalMs += Math.max(0, Math.min(end, windowEndUtc) - Math.max(start, windowStartUtc));
      }
    }
    day += 86400000;
  }
  return Math.round(totalMs / 60000);
}

module.exports = { calculateAvailability, calculateNetRequirement, calculateBusinessMinutes };
