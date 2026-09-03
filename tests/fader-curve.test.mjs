import assert from "node:assert/strict";
import test from "node:test";

import { createFaderCurvePath, evaluateFaderCurve } from "../app/fader-curve.ts";

const SAMPLE_COUNT = 1_000;

test("CC64 is exactly linear for every sample", () => {
  for (let index = 0; index <= SAMPLE_COUNT; index += 1) {
    const t = index / SAMPLE_COUNT;
    assert.equal(evaluateFaderCurve(64, t), t);
  }
});

test("CC0 and CC127 are point-symmetric", () => {
  for (let index = 0; index <= SAMPLE_COUNT; index += 1) {
    const t = index / SAMPLE_COUNT;
    const reflectedEarlyRise = 1 - evaluateFaderCurve(127, 1 - t);
    assert.ok(Math.abs(evaluateFaderCurve(0, t) - reflectedEarlyRise) < 1e-12);
  }
});

test("every CC curve is monotonic and keeps both endpoints", () => {
  for (let cc = 0; cc <= 127; cc += 1) {
    assert.equal(evaluateFaderCurve(cc, 0), 0, `CC${cc} at t=0`);
    assert.equal(evaluateFaderCurve(cc, 1), 1, `CC${cc} at t=1`);

    let previous = 0;
    for (let index = 1; index <= SAMPLE_COUNT; index += 1) {
      const current = evaluateFaderCurve(cc, index / SAMPLE_COUNT);
      assert.ok(current >= previous, `CC${cc} decreases at sample ${index}`);
      previous = current;
    }
  }
});

test("CC127 reaches approximately 0.9 at two percent travel", () => {
  assert.ok(Math.abs(evaluateFaderCurve(127, 0.02) - 0.9) < 1e-9);
});

test("curve paths sample the plot width and include both endpoints", () => {
  const path = createFaderCurvePath(64, 284, 124, 18, 144);
  const points = path.split(/(?=[ML] )/);

  assert.equal(points.length, 285);
  assert.equal(points[0], "M 18.00 144.00 ");
  assert.equal(points.at(-1), "L 302.00 20.00");
});

test("descending curve paths swap the rendered endpoints", () => {
  const path = createFaderCurvePath(64, 284, 124, 18, 144, true);
  const points = path.split(/(?=[ML] )/);

  assert.equal(points[0], "M 18.00 20.00 ");
  assert.equal(points.at(-1), "L 302.00 144.00");
});
