import assert from "node:assert/strict";
import test from "node:test";

import { RESTORE_DEFAULT_CONFIG } from "../app/midi/jumbleq-midi.ts";
import { parseJumbleqPreset, serializeJumbleqPreset } from "../app/presets/jumbleq-preset.ts";

const validPreset = {
  ch1Type: "PHONO",
  ch2Type: "LINE",
  assignA: "USB 1/2",
  assignB: "CH 2",
  assignPost: "USB 3/4",
  ch1Mode: "DVS",
  ch2Mode: "SYNTH",
  returnSource: "None",
  headphoneSource: "Fader B",
  sensor2: "B",
  sensor3: "A",
  magMode: "NOTE",
  curveA: 0,
  curveB: 100,
  dvsFaderDelayMs: 73,
  reverseA: true,
  reverseB: false,
};

function withoutInputModes(preset) {
  const legacyFields = { ...preset };
  delete legacyFields.ch1Mode;
  delete legacyFields.ch2Mode;
  return legacyFields;
}

test("current flat preset format serializes and parses without data loss", () => {
  assert.deepEqual(parseJumbleqPreset(serializeJumbleqPreset(validPreset)), validPreset);
  assert.deepEqual(parseJumbleqPreset(serializeJumbleqPreset(RESTORE_DEFAULT_CONFIG)), RESTORE_DEFAULT_CONFIG);
});

test("legacy DVS booleans migrate to OFF/DVS input modes", () => {
  const sharedFields = withoutInputModes(validPreset);
  const imported = parseJumbleqPreset(JSON.stringify({
    ...sharedFields,
    dvs1: true,
    dvs2: false,
  }));

  assert.deepEqual(imported, {
    ...sharedFields,
    ch1Mode: "DVS",
    ch2Mode: "OFF",
  });
  assert.equal(Object.hasOwn(imported, "dvs1"), false);
  assert.equal(Object.hasOwn(imported, "dvs2"), false);
});

test("validated input modes take precedence over legacy DVS booleans", () => {
  const imported = parseJumbleqPreset(JSON.stringify({
    ...validPreset,
    ch1Mode: "SYNTH",
    ch2Mode: "OFF",
    dvs1: true,
    dvs2: true,
  }));

  assert.equal(imported.ch1Mode, "SYNTH");
  assert.equal(imported.ch2Mode, "OFF");
});

test("serialization emits only current input mode fields", () => {
  const serialized = JSON.parse(serializeJumbleqPreset({
    ...validPreset,
    dvs1: true,
    dvs2: false,
  }));

  assert.equal(serialized.ch1Mode, "DVS");
  assert.equal(serialized.ch2Mode, "SYNTH");
  assert.equal(Object.hasOwn(serialized, "dvs1"), false);
  assert.equal(Object.hasOwn(serialized, "dvs2"), false);
});

test("parser returns only supported fields", () => {
  const imported = parseJumbleqPreset(JSON.stringify({
    ...validPreset,
    futureField: "ignored",
    __proto__: "ignored",
  }));

  assert.deepEqual(imported, validPreset);
  assert.equal(Object.hasOwn(imported, "futureField"), false);
});

test("parser rejects malformed JSON and non-object roots", () => {
  assert.throws(() => parseJumbleqPreset("{"), /not valid JSON/);
  assert.throws(() => parseJumbleqPreset("null"), /must be a JSON object/);
  assert.throws(() => parseJumbleqPreset("[]"), /must be a JSON object/);
  assert.throws(() => parseJumbleqPreset('"preset"'), /must be a JSON object/);
});

test("parser rejects every missing required field", () => {
  for (const field of Object.keys(validPreset).filter((field) => !["reverseA", "reverseB", "dvsFaderDelayMs"].includes(field))) {
    const incomplete = { ...validPreset };
    delete incomplete[field];
    const expectedField = field === "ch1Mode" ? "dvs1" : field === "ch2Mode" ? "dvs2" : field;
    assert.throws(() => parseJumbleqPreset(JSON.stringify(incomplete)), new RegExp(expectedField), field);
  }
});

test("legacy presets default missing reverse settings to off", () => {
  const legacyPreset = Object.fromEntries(
    Object.entries(validPreset).filter(([field]) => field !== "reverseA" && field !== "reverseB"),
  );
  assert.deepEqual(parseJumbleqPreset(JSON.stringify(legacyPreset)), {
    ...legacyPreset,
    reverseA: false,
    reverseB: false,
  });
});

test("legacy presets default a missing DVS fader delay to 50 ms", () => {
  const legacyPreset = { ...validPreset };
  delete legacyPreset.dvsFaderDelayMs;
  assert.equal(parseJumbleqPreset(JSON.stringify(legacyPreset)).dvsFaderDelayMs, 50);
});

test("parser converts DVS fader delay to an integer and clamps it to 0-120 ms", () => {
  const cases = [
    [-4, 0],
    [0, 0],
    [49.6, 50],
    ["72", 72],
    [120, 120],
    [127, 120],
  ];
  for (const [value, expected] of cases) {
    assert.equal(
      parseJumbleqPreset(JSON.stringify({ ...validPreset, dvsFaderDelayMs: value })).dvsFaderDelayMs,
      expected,
    );
  }

  for (const value of [null, true, "delay", ""]) {
    assert.throws(
      () => parseJumbleqPreset(JSON.stringify({ ...validPreset, dvsFaderDelayMs: value })),
      /dvsFaderDelayMs/,
    );
  }
});

test("parser rejects unsupported enum values", () => {
  const invalidValues = {
    ch1Type: "MIC",
    ch2Type: "MIC",
    assignA: "Bluetooth",
    assignB: "Bluetooth",
    assignPost: "Bluetooth",
    ch1Mode: "VINYL",
    ch2Mode: "ANALOG",
    returnSource: "USB 5/6",
    headphoneSource: "Return",
    sensor2: "C",
    sensor3: "C",
    magMode: "POLY",
  };

  for (const [field, value] of Object.entries(invalidValues)) {
    assert.throws(
      () => parseJumbleqPreset(JSON.stringify({ ...validPreset, [field]: value })),
      new RegExp(field),
      field,
    );
  }
});

test("parser rejects invalid new modes and invalid legacy DVS values", () => {
  for (const value of [1, true, null, "VINYL"]) {
    assert.throws(() => parseJumbleqPreset(JSON.stringify({ ...validPreset, ch1Mode: value })), /ch1Mode/);
    assert.throws(() => parseJumbleqPreset(JSON.stringify({ ...validPreset, ch2Mode: value })), /ch2Mode/);
  }

  const legacyFields = withoutInputModes(validPreset);
  assert.throws(() => parseJumbleqPreset(JSON.stringify({ ...legacyFields, dvs1: 1, dvs2: false })), /dvs1/);
  assert.throws(() => parseJumbleqPreset(JSON.stringify({ ...legacyFields, dvs1: true, dvs2: "false" })), /dvs2/);
});

test("parser requires real boolean reverse values when present", () => {
  assert.throws(() => parseJumbleqPreset(JSON.stringify({ ...validPreset, reverseA: 1 })), /reverseA/);
  assert.throws(() => parseJumbleqPreset(JSON.stringify({ ...validPreset, reverseB: "false" })), /reverseB/);
});

test("parser accepts only integer curve percentages from 0 through 100", () => {
  for (const value of [-1, 100.1, 101, "50", null]) {
    assert.throws(
      () => parseJumbleqPreset(JSON.stringify({ ...validPreset, curveA: value })),
      /curveA/,
      String(value),
    );
  }

  assert.equal(parseJumbleqPreset(JSON.stringify({ ...validPreset, curveA: 0 })).curveA, 0);
  assert.equal(parseJumbleqPreset(JSON.stringify({ ...validPreset, curveB: 100 })).curveB, 100);
});
