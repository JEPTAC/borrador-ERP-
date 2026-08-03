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

const DAY_MS = 86400000;
function isoUtcDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
function utcDate(year, month, day) { return new Date(Date.UTC(year, month - 1, day)); }
function addDays(date, days) { return new Date(date.getTime() + days * DAY_MS); }
function nextMonday(date) { return addDays(date, (8 - date.getUTCDay()) % 7); }
function easterSunday(year) {
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
  return utcDate(year, month, day);
}
function colombianHolidays(year) {
  const dates=[utcDate(year,1,1),utcDate(year,5,1),utcDate(year,7,20),utcDate(year,8,7),utcDate(year,12,8),utcDate(year,12,25)];
  for (const [month,day] of [[1,6],[3,19],[6,29],[8,15],[10,12],[11,1],[11,11]]) dates.push(nextMonday(utcDate(year,month,day)));
  const easter=easterSunday(year);
  for (const days of [-3,-2,43,64,71]) dates.push(addDays(easter,days));
  return [...new Set(dates.map(isoUtcDate))].sort();
}
function calculateBusinessMinutes(startValue, endValue, calendar = {}) {
  const start = toMillis(startValue);
  const end = toMillis(endValue);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  const offset = number(calendar.utcOffsetMinutes == null ? -300 : calendar.utcOffsetMinutes);
  const offsetMs = offset * 60000;
  const workdays = new Set(calendar.workdays || [1, 2, 3, 4, 5]);
  const configured = new Set(calendar.holidays || []);
  const windows = calendar.windows || [[420, 720], [820, 1050]];
  const localStart = start + offsetMs;
  const localEnd = end + offsetMs;
  let day = Math.floor(localStart / DAY_MS) * DAY_MS;
  const lastDay = Math.floor(localEnd / DAY_MS) * DAY_MS;
  let totalMs = 0;
  const holidayYears = new Map();
  while (day <= lastDay) {
    const localDate = new Date(day);
    const year = localDate.getUTCFullYear();
    if (!holidayYears.has(year)) holidayYears.set(year, new Set(calendar.country === "CO" || calendar.dynamicColombianHolidays !== false ? colombianHolidays(year) : []));
    const dateKey = isoUtcDate(localDate);
    const weekday = localDate.getUTCDay();
    if (workdays.has(weekday) && !configured.has(dateKey) && !holidayYears.get(year).has(dateKey)) {
      for (const window of windows) {
        const windowStartUtc = day + number(window[0]) * 60000 - offsetMs;
        const windowEndUtc = day + number(window[1]) * 60000 - offsetMs;
        totalMs += Math.max(0, Math.min(end, windowEndUtc) - Math.max(start, windowStartUtc));
      }
    }
    day += DAY_MS;
  }
  return Math.round(totalMs / 60000);
}

module.exports = { calculateAvailability, calculateNetRequirement, calculateBusinessMinutes, colombianHolidays, easterSunday };
