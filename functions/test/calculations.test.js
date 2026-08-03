"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const calendar = require("../config/business-calendar.co-2026.json");
const {
  calculateAvailability,
  calculateNetRequirement,
  calculateBusinessMinutes,
} = require("../lib/erp-calculations");

test("availability excludes quarantine and subtracts active reservations", () => {
  assert.deepEqual(
    calculateAvailability(
      [{ quantity: 80 }, { quantity: 20, stockStatus: "QUARANTINE" }],
      [{ quantity: 25, consumedQuantity: 5, status: "ACTIVE" }]
    ),
    { onHand: 80, reserved: 20, available: 60 }
  );
});

test("net requirements include safety stock and top-up policy", () => {
  assert.deepEqual(
    calculateNetRequirement({ grossDemand: 70, onHand: 50, reserved: 10, safetyStock: 5 }),
    { available: 40, netRequirement: 35, proposedQty: 35 }
  );
});

test("business time excludes lunch and holidays", () => {
  assert.equal(calculateBusinessMinutes("2026-08-03T12:00:00Z", "2026-08-03T22:30:00Z", calendar), 530);
  assert.equal(calculateBusinessMinutes("2026-01-01T12:00:00Z", "2026-01-01T22:30:00Z", calendar), 0);
});
