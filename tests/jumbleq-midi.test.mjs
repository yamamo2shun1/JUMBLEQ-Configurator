import assert from "node:assert/strict";
import test from "node:test";

import {
  ARM_UF2_BOOTLOADER,
  CANCEL_UF2_BOOTLOADER,
  CURVE_EDIT_OFF,
  CURVE_EDIT_ON,
  DVS_FADER_DELAY_DEFAULT_MS,
  DVS_FADER_DELAY_MAX_MS,
  decodeConfigMessage,
  decodeMagneticLiveMessage,
  encodeCurveSetting,
  encodeDvsFaderDelaySetting,
  encodeProgramSetting,
  isConfigDumpEndMessage,
  REQUEST_CURRENT_CONFIG,
  RESTORE_DEFAULT_CONFIG,
  SAVE_CURRENT_CONFIG,
  SYNC_FIELD_COUNT,
  SYNC_FIELDS,
  curvePercentToMidiCC,
} from "../app/midi/jumbleq-midi.ts";

const PROGRAM_CHANGE_CH_15 = 0xce;
const CONTROL_CHANGE_CH_15 = 0xbe;
const CONTROL_CHANGE_CH_1 = 0xb0;
const NOTE_ON_CH_1 = 0x90;
const NOTE_OFF_CH_1 = 0x80;

function bytes(message) {
  return Array.from(message);
}

test("control commands use MIDI channel 15 and the documented programs", () => {
  assert.deepEqual(bytes(CURVE_EDIT_OFF), [PROGRAM_CHANGE_CH_15, 120]);
  assert.deepEqual(bytes(CURVE_EDIT_ON), [PROGRAM_CHANGE_CH_15, 121]);
  assert.deepEqual(bytes(ARM_UF2_BOOTLOADER), [PROGRAM_CHANGE_CH_15, 124]);
  assert.deepEqual(bytes(CANCEL_UF2_BOOTLOADER), [PROGRAM_CHANGE_CH_15, 125]);
  assert.deepEqual(bytes(REQUEST_CURRENT_CONFIG), [PROGRAM_CHANGE_CH_15, 126]);
  assert.deepEqual(bytes(SAVE_CURRENT_CONFIG), [PROGRAM_CHANGE_CH_15, 127]);
});

test("UF2 control commands are not decoded as configuration settings", () => {
  assert.equal(decodeConfigMessage(ARM_UF2_BOOTLOADER), null);
  assert.equal(decodeConfigMessage(CANCEL_UF2_BOOTLOADER), null);
});

test("restore defaults contain one value for every synchronized field", () => {
  assert.deepEqual(SYNC_FIELDS, [
    "ch1Type",
    "ch2Type",
    "assignA",
    "assignB",
    "assignPost",
    "ch1Mode",
    "ch2Mode",
    "returnSource",
    "headphoneSource",
    "sensor2",
    "sensor3",
    "magMode",
    "curveA",
    "curveB",
    "dvsFaderDelayMs",
    "reverseA",
    "reverseB",
    "synthRatioSet",
    "synthWarpAlgorithm",
  ]);
  assert.equal(SYNC_FIELD_COUNT, 19);
  assert.deepEqual(Object.keys(RESTORE_DEFAULT_CONFIG).sort(), [...SYNC_FIELDS].sort());
  assert.deepEqual(RESTORE_DEFAULT_CONFIG, {
    ch1Type: "LINE",
    ch2Type: "LINE",
    assignA: "CH 1",
    assignB: "CH 2",
    assignPost: "USB 1/2",
    ch1Mode: "OFF",
    ch2Mode: "OFF",
    returnSource: "USB 3/4",
    headphoneSource: "Master",
    sensor2: "A",
    sensor3: "B",
    magMode: "CC",
    curveA: 50,
    curveB: 50,
    dvsFaderDelayMs: DVS_FADER_DELAY_DEFAULT_MS,
    reverseA: false,
    reverseB: false,
    synthRatioSet: "OCTAVE",
    synthWarpAlgorithm: "CROSSFOLD",
  });
});

const programSettingCases = [
  ["ch1Type", "LINE", 0],
  ["ch1Type", "PHONO", 1],
  ["ch2Type", "LINE", 2],
  ["ch2Type", "PHONO", 3],
  ["assignA", "CH 1", 4],
  ["assignA", "CH 2", 5],
  ["assignA", "USB 1/2", 6],
  ["assignA", "USB 3/4", 7],
  ["assignB", "CH 1", 8],
  ["assignB", "CH 2", 9],
  ["assignB", "USB 1/2", 10],
  ["assignB", "USB 3/4", 11],
  ["assignPost", "CH 1", 12],
  ["assignPost", "CH 2", 13],
  ["assignPost", "USB 1/2", 14],
  ["assignPost", "USB 3/4", 15],
  ["ch1Mode", "OFF", 16],
  ["ch1Mode", "DVS", 17],
  ["ch1Mode", "SYNTH", 18],
  ["ch2Mode", "OFF", 19],
  ["ch2Mode", "DVS", 20],
  ["ch2Mode", "SYNTH", 21],
  ["returnSource", "USB 1/2", 22],
  ["returnSource", "USB 3/4", 23],
  ["returnSource", "None", 24],
  ["headphoneSource", "Fader A", 25],
  ["headphoneSource", "Fader B", 26],
  ["headphoneSource", "Thru", 27],
  ["headphoneSource", "Master", 28],
  ["sensor2", "A", 29],
  ["sensor2", "B", 30],
  ["sensor3", "A", 31],
  ["sensor3", "B", 32],
  ["reverseA", false, 33],
  ["reverseA", true, 34],
  ["reverseB", false, 35],
  ["reverseB", true, 36],
  ["synthRatioSet", "OCTAVE", 37],
  ["synthRatioSet", "HARMONIC", 38],
  ["synthRatioSet", "CHORD", 39],
  ["synthWarpAlgorithm", "CLEAN", 40],
  ["synthWarpAlgorithm", "CROSSFOLD", 41],
  ["synthWarpAlgorithm", "RING MOD", 42],
  ["synthWarpAlgorithm", "COMPARATOR", 43],
  ["magMode", "CC", 122],
  ["magMode", "NOTE", 123],
];

test("every program setting follows the documented PC map and decodes back", () => {
  for (const [field, value, program] of programSettingCases) {
    const encoded = encodeProgramSetting(field, value);
    assert.deepEqual(bytes(encoded), [PROGRAM_CHANGE_CH_15, program], `${field}=${String(value)}`);
    assert.deepEqual(decodeConfigMessage(encoded), { field, value }, `decode PC${program}`);
  }
});

test("program encoder rejects values that could otherwise select another setting", () => {
  assert.throws(() => encodeProgramSetting("ch1Type", "MIC"), /Invalid value for ch1Type/);
  assert.throws(() => encodeProgramSetting("assignA", "INVALID"), /Invalid value for assignA/);
  assert.throws(() => encodeProgramSetting("ch1Mode", "INVALID"), /Invalid value for ch1Mode/);
  assert.throws(() => encodeProgramSetting("ch2Mode", true), /Invalid value for ch2Mode/);
  assert.throws(() => encodeProgramSetting("dvs1", true), /Unknown setting field/);
  assert.throws(() => encodeProgramSetting("dvs2", false), /Unknown setting field/);
  assert.throws(() => encodeProgramSetting("reverseA", "true"), /Invalid value for reverseA/);
  assert.throws(() => encodeProgramSetting("synthRatioSet", "FIFTHS"), /Invalid value for synthRatioSet/);
  assert.throws(() => encodeProgramSetting("synthWarpAlgorithm", "FOLD"), /Invalid value for synthWarpAlgorithm/);
  assert.throws(() => encodeProgramSetting("magMode", "POLY"), /Invalid value for magMode/);
  assert.throws(() => encodeProgramSetting("unknown", "LINE"), /Unknown setting field/);
});

test("curve percentages map to the full MIDI CC range", () => {
  assert.equal(curvePercentToMidiCC(-20), 0);
  assert.equal(curvePercentToMidiCC(0), 0);
  assert.equal(curvePercentToMidiCC(25), 32);
  assert.equal(curvePercentToMidiCC(50), 64);
  assert.equal(curvePercentToMidiCC(75), 95);
  assert.equal(curvePercentToMidiCC(100), 127);
  assert.equal(curvePercentToMidiCC(120), 127);
  assert.throws(() => curvePercentToMidiCC(Number.NaN), /finite number/);
  assert.throws(() => curvePercentToMidiCC(Number.POSITIVE_INFINITY), /finite number/);
});

test("curve messages use CC20/21 on MIDI channel 15 and round-trip 0-100 percent", () => {
  assert.deepEqual(bytes(encodeCurveSetting("curveA", 50)), [CONTROL_CHANGE_CH_15, 20, 64]);
  assert.deepEqual(bytes(encodeCurveSetting("curveB", 50)), [CONTROL_CHANGE_CH_15, 21, 64]);
  assert.throws(() => encodeCurveSetting("curveC", 50), /Unknown curve field/);

  for (let percent = 0; percent <= 100; percent += 1) {
    assert.deepEqual(decodeConfigMessage(encodeCurveSetting("curveA", percent)), { field: "curveA", value: percent });
    assert.deepEqual(decodeConfigMessage(encodeCurveSetting("curveB", percent)), { field: "curveB", value: percent });
  }
});

test("DVS fader delay uses CC22 on MIDI channel 15 and clamps to 0-120 ms", () => {
  assert.deepEqual(bytes(encodeDvsFaderDelaySetting(0)), [CONTROL_CHANGE_CH_15, 22, 0]);
  assert.deepEqual(bytes(encodeDvsFaderDelaySetting(50)), [CONTROL_CHANGE_CH_15, 22, 50]);
  assert.deepEqual(bytes(encodeDvsFaderDelaySetting(120)), [CONTROL_CHANGE_CH_15, 22, 120]);
  assert.deepEqual(bytes(encodeDvsFaderDelaySetting(-1)), [CONTROL_CHANGE_CH_15, 22, 0]);
  assert.deepEqual(bytes(encodeDvsFaderDelaySetting(121)), [CONTROL_CHANGE_CH_15, 22, 120]);
  assert.deepEqual(bytes(encodeDvsFaderDelaySetting(49.6)), [CONTROL_CHANGE_CH_15, 22, 50]);
  assert.throws(() => encodeDvsFaderDelaySetting(Number.NaN), /finite number/);
});

test("decoder converts every raw curve CC value to a normalized percentage", () => {
  for (let value = 0; value <= 127; value += 1) {
    const expected = Math.round((value * 100) / 127);
    assert.deepEqual(
      decodeConfigMessage(new Uint8Array([CONTROL_CHANGE_CH_15, 20, value])),
      { field: "curveA", value: expected },
    );
    assert.deepEqual(
      decodeConfigMessage(new Uint8Array([CONTROL_CHANGE_CH_15, 21, value])),
      { field: "curveB", value: expected },
    );
  }
});

test("decoder reads Ch. 15 CC22 directly as milliseconds", () => {
  for (let value = 0; value <= 127; value += 1) {
    assert.deepEqual(
      decodeConfigMessage(new Uint8Array([CONTROL_CHANGE_CH_15, 22, value])),
      { field: "dvsFaderDelayMs", value: Math.min(DVS_FADER_DELAY_MAX_MS, value) },
    );
  }
});

test("configuration dump end detection accepts only Ch. 15 PC122/123", () => {
  assert.equal(isConfigDumpEndMessage(new Uint8Array([PROGRAM_CHANGE_CH_15, 122])), true);
  assert.equal(isConfigDumpEndMessage(new Uint8Array([PROGRAM_CHANGE_CH_15, 123])), true);
  assert.equal(isConfigDumpEndMessage(new Uint8Array([PROGRAM_CHANGE_CH_15, 121])), false);
  assert.equal(isConfigDumpEndMessage(new Uint8Array([0xc0, 122])), false);
  assert.equal(isConfigDumpEndMessage(new Uint8Array([CONTROL_CHANGE_CH_15, 22, 50])), false);
});

test("decoder ignores incomplete, unrelated, and wrong-channel MIDI messages", () => {
  const ignoredMessages = [
    [],
    [PROGRAM_CHANGE_CH_15],
    [0xc0, 0],
    [PROGRAM_CHANGE_CH_15, 44],
    [CONTROL_CHANGE_CH_15, 20],
    [0xb0, 20, 64],
    [0xb0, 22, 64],
    [0x9e, 60, 127],
  ];

  for (const message of ignoredMessages) {
    assert.equal(decodeConfigMessage(new Uint8Array(message)), null, bytes(new Uint8Array(message)).join(","));
  }
});

test("live magnetic CC messages map CC12-15 to controls 0-3", () => {
  for (let index = 0; index < 4; index += 1) {
    assert.deepEqual(
      decodeMagneticLiveMessage(new Uint8Array([CONTROL_CHANGE_CH_1, 12 + index, 96])),
      { index, mode: "CC", value: 96, active: true },
    );
    assert.deepEqual(
      decodeMagneticLiveMessage(new Uint8Array([CONTROL_CHANGE_CH_1, 12 + index, 0])),
      { index, mode: "CC", value: 0, active: false },
    );
  }
});

test("live magnetic Note messages map notes 68-71 and recognize releases", () => {
  for (let index = 0; index < 4; index += 1) {
    assert.deepEqual(
      decodeMagneticLiveMessage(new Uint8Array([NOTE_ON_CH_1, 68 + index, 112])),
      { index, mode: "NOTE", value: 112, active: true },
    );
    assert.deepEqual(
      decodeMagneticLiveMessage(new Uint8Array([NOTE_OFF_CH_1, 68 + index, 0])),
      { index, mode: "NOTE", value: 0, active: false },
    );
    assert.deepEqual(
      decodeMagneticLiveMessage(new Uint8Array([NOTE_ON_CH_1, 68 + index, 0])),
      { index, mode: "NOTE", value: 0, active: false },
    );
  }
});

test("live magnetic decoder ignores other messages and channels", () => {
  const ignoredMessages = [
    [],
    [CONTROL_CHANGE_CH_1, 12],
    [CONTROL_CHANGE_CH_1, 11, 64],
    [CONTROL_CHANGE_CH_1, 16, 64],
    [0xb1, 12, 64],
    [NOTE_ON_CH_1, 67, 100],
    [NOTE_ON_CH_1, 72, 100],
    [0x91, 68, 100],
    [PROGRAM_CHANGE_CH_15, 126],
    [CONTROL_CHANGE_CH_15, 20, 64],
  ];

  for (const message of ignoredMessages) {
    assert.equal(decodeMagneticLiveMessage(new Uint8Array(message)), null, bytes(new Uint8Array(message)).join(","));
  }
});
