import type { InputMode, JumbleqConfig } from "../midi/jumbleq-midi";

const inputTypes = ["LINE", "PHONO"] as const;
const inputModes = ["OFF", "DVS", "SYNTH"] as const;
const sources = ["CH 1", "CH 2", "USB 1/2", "USB 3/4"] as const;
const returnSources = ["USB 1/2", "USB 3/4", "None"] as const;
const headphoneSources = ["Fader A", "Fader B", "Thru", "Master"] as const;
const auxiliarySides = ["A", "B"] as const;
const magneticModes = ["CC", "NOTE"] as const;
const DVS_FADER_DELAY_DEFAULT_MS = 50;
const DVS_FADER_DELAY_MIN_MS = 0;
const DVS_FADER_DELAY_MAX_MS = 120;

function normalizeDvsFaderDelayMs(value: number) {
  return Math.min(DVS_FADER_DELAY_MAX_MS, Math.max(DVS_FADER_DELAY_MIN_MS, Math.round(value)));
}

function presetObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Preset must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

function enumValue<const Value extends string>(
  preset: Record<string, unknown>,
  field: string,
  allowedValues: readonly Value[],
): Value {
  const value = preset[field];
  if (!allowedValues.includes(value as Value)) {
    throw new Error(`${field} must be one of: ${allowedValues.join(", ")}.`);
  }
  return value as Value;
}

function booleanValue(preset: Record<string, unknown>, field: string): boolean {
  const value = preset[field];
  if (typeof value !== "boolean") throw new Error(`${field} must be true or false.`);
  return value;
}

function optionalBooleanValue(preset: Record<string, unknown>, field: string): boolean {
  return preset[field] === undefined ? false : booleanValue(preset, field);
}

function inputModeValue(
  preset: Record<string, unknown>,
  field: "ch1Mode" | "ch2Mode",
  legacyField: "dvs1" | "dvs2",
): InputMode {
  if (Object.hasOwn(preset, field)) return enumValue(preset, field, inputModes);
  return booleanValue(preset, legacyField) ? "DVS" : "OFF";
}

function curveValue(preset: Record<string, unknown>, field: string): number {
  const value = preset[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) {
    throw new Error(`${field} must be an integer from 0 to 100.`);
  }
  return value;
}

function dvsFaderDelayValue(preset: Record<string, unknown>): number {
  const value = preset.dvsFaderDelayMs;
  if (value === undefined) return DVS_FADER_DELAY_DEFAULT_MS;
  const numericValue = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(numericValue)) {
    throw new Error("dvsFaderDelayMs must be a number.");
  }
  return normalizeDvsFaderDelayMs(numericValue);
}

export function parseJumbleqPreset(text: string): JumbleqConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Preset file is not valid JSON.");
  }

  const preset = presetObject(parsed);
  return {
    ch1Type: enumValue(preset, "ch1Type", inputTypes),
    ch2Type: enumValue(preset, "ch2Type", inputTypes),
    assignA: enumValue(preset, "assignA", sources),
    assignB: enumValue(preset, "assignB", sources),
    assignPost: enumValue(preset, "assignPost", sources),
    ch1Mode: inputModeValue(preset, "ch1Mode", "dvs1"),
    ch2Mode: inputModeValue(preset, "ch2Mode", "dvs2"),
    returnSource: enumValue(preset, "returnSource", returnSources),
    headphoneSource: enumValue(preset, "headphoneSource", headphoneSources),
    sensor2: enumValue(preset, "sensor2", auxiliarySides),
    sensor3: enumValue(preset, "sensor3", auxiliarySides),
    magMode: enumValue(preset, "magMode", magneticModes),
    curveA: curveValue(preset, "curveA"),
    curveB: curveValue(preset, "curveB"),
    dvsFaderDelayMs: dvsFaderDelayValue(preset),
    reverseA: optionalBooleanValue(preset, "reverseA"),
    reverseB: optionalBooleanValue(preset, "reverseB"),
  };
}

export function serializeJumbleqPreset(config: JumbleqConfig) {
  return JSON.stringify({
    ch1Type: config.ch1Type,
    ch2Type: config.ch2Type,
    assignA: config.assignA,
    assignB: config.assignB,
    assignPost: config.assignPost,
    ch1Mode: config.ch1Mode,
    ch2Mode: config.ch2Mode,
    returnSource: config.returnSource,
    headphoneSource: config.headphoneSource,
    sensor2: config.sensor2,
    sensor3: config.sensor3,
    magMode: config.magMode,
    curveA: config.curveA,
    curveB: config.curveB,
    dvsFaderDelayMs: normalizeDvsFaderDelayMs(config.dvsFaderDelayMs),
    reverseA: config.reverseA,
    reverseB: config.reverseB,
  }, null, 2);
}
