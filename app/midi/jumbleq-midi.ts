export type Source = "CH 1" | "CH 2" | "USB 1/2" | "USB 3/4";
export type InputType = "LINE" | "PHONO";
export type InputMode = "OFF" | "DVS" | "SYNTH";
export type ReturnSource = "USB 1/2" | "USB 3/4" | "None";
export type HeadphoneSource = "Fader A" | "Fader B" | "Thru" | "Master";
export type MagneticMode = "CC" | "NOTE";
export type AuxiliarySide = "A" | "B";

export type MagneticLiveMessage = {
  index: 0 | 1 | 2 | 3;
  mode: MagneticMode;
  value: number;
  active: boolean;
};

export type JumbleqConfig = {
  ch1Type: InputType;
  ch2Type: InputType;
  assignA: Source;
  assignB: Source;
  assignPost: Source;
  ch1Mode: InputMode;
  ch2Mode: InputMode;
  returnSource: ReturnSource;
  headphoneSource: HeadphoneSource;
  sensor2: AuxiliarySide;
  sensor3: AuxiliarySide;
  magMode: MagneticMode;
  curveA: number;
  curveB: number;
  dvsFaderDelayMs: number;
  reverseA: boolean;
  reverseB: boolean;
};

export const DVS_FADER_DELAY_MIN_MS = 0;
export const DVS_FADER_DELAY_MAX_MS = 120;
export const DVS_FADER_DELAY_DEFAULT_MS = 50;

export const RESTORE_DEFAULT_CONFIG: JumbleqConfig = {
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
};

export type SyncField = keyof JumbleqConfig;
export type ProgramSettingField = Exclude<SyncField, "curveA" | "curveB" | "dvsFaderDelayMs">;

export const SYNC_FIELDS: readonly SyncField[] = [
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
];

export const SYNC_FIELD_COUNT = SYNC_FIELDS.length;

const MIDI_CHANNEL_15 = 14;
const PROGRAM_CHANGE = 0xc0;
const CONTROL_CHANGE = 0xb0;
const inputTypes: readonly InputType[] = ["LINE", "PHONO"];
const inputModes: readonly InputMode[] = ["OFF", "DVS", "SYNTH"];
const sources: readonly Source[] = ["CH 1", "CH 2", "USB 1/2", "USB 3/4"];
const returnSources: readonly ReturnSource[] = ["USB 1/2", "USB 3/4", "None"];
const headphoneSources: readonly HeadphoneSource[] = ["Fader A", "Fader B", "Thru", "Master"];
const auxiliarySides: readonly AuxiliarySide[] = ["A", "B"];
const magneticModes: readonly MagneticMode[] = ["CC", "NOTE"];

export const REQUEST_CURRENT_CONFIG = new Uint8Array([
  PROGRAM_CHANGE | MIDI_CHANNEL_15,
  126,
]);

function programChange(program: number) {
  return new Uint8Array([PROGRAM_CHANGE | MIDI_CHANNEL_15, program]);
}

function settingIndex<Value extends string>(
  field: ProgramSettingField,
  value: unknown,
  allowedValues: readonly Value[],
) {
  const index = allowedValues.indexOf(value as Value);
  if (index < 0) throw new Error(`Invalid value for ${field}.`);
  return index;
}

function booleanIndex(field: ProgramSettingField, value: unknown) {
  if (typeof value !== "boolean") throw new Error(`Invalid value for ${field}.`);
  return value ? 1 : 0;
}

export const CURVE_EDIT_OFF = programChange(120);
export const CURVE_EDIT_ON = programChange(121);
export const ARM_UF2_BOOTLOADER = programChange(124);
export const CANCEL_UF2_BOOTLOADER = programChange(125);
export const SAVE_CURRENT_CONFIG = programChange(127);

export type DecodedConfigValue = {
  [Key in SyncField]: { field: Key; value: JumbleqConfig[Key] };
}[SyncField];

function curveMidiCCToPercent(value: number) {
  return Math.round((value * 100) / 127);
}

export function curvePercentToMidiCC(percent: number) {
  if (!Number.isFinite(percent)) throw new Error("Curve percentage must be a finite number.");
  return Math.round(Math.min(100, Math.max(0, percent)) * 127 / 100);
}

export function normalizeDvsFaderDelayMs(milliseconds: number) {
  if (!Number.isFinite(milliseconds)) throw new Error("DVS fader delay must be a finite number.");
  return Math.min(
    DVS_FADER_DELAY_MAX_MS,
    Math.max(DVS_FADER_DELAY_MIN_MS, Math.round(milliseconds)),
  );
}

export function encodeProgramSetting(
  field: ProgramSettingField,
  value: JumbleqConfig[ProgramSettingField],
) {
  let program: number;

  switch (field) {
    case "ch1Type": program = settingIndex(field, value, inputTypes); break;
    case "ch2Type": program = 2 + settingIndex(field, value, inputTypes); break;
    case "assignA": program = 4 + settingIndex(field, value, sources); break;
    case "assignB": program = 8 + settingIndex(field, value, sources); break;
    case "assignPost": program = 12 + settingIndex(field, value, sources); break;
    case "ch1Mode": program = 16 + settingIndex(field, value, inputModes); break;
    case "ch2Mode": program = 19 + settingIndex(field, value, inputModes); break;
    case "returnSource": program = 22 + settingIndex(field, value, returnSources); break;
    case "headphoneSource": program = 25 + settingIndex(field, value, headphoneSources); break;
    case "sensor2": program = 29 + settingIndex(field, value, auxiliarySides); break;
    case "sensor3": program = 31 + settingIndex(field, value, auxiliarySides); break;
    case "reverseA": program = 33 + booleanIndex(field, value); break;
    case "reverseB": program = 35 + booleanIndex(field, value); break;
    case "magMode": program = 122 + settingIndex(field, value, magneticModes); break;
    default: throw new Error(`Unknown setting field: ${String(field)}.`);
  }

  return programChange(program);
}

export function encodeCurveSetting(field: "curveA" | "curveB", percent: number) {
  if (field !== "curveA" && field !== "curveB") throw new Error(`Unknown curve field: ${String(field)}.`);
  return new Uint8Array([
    CONTROL_CHANGE | MIDI_CHANNEL_15,
    field === "curveA" ? 20 : 21,
    curvePercentToMidiCC(percent),
  ]);
}

export function encodeDvsFaderDelaySetting(milliseconds: number) {
  return new Uint8Array([
    CONTROL_CHANGE | MIDI_CHANNEL_15,
    22,
    normalizeDvsFaderDelayMs(milliseconds),
  ]);
}

function decodeProgramChange(program: number): DecodedConfigValue | null {
  if (program >= 0 && program <= 1) return { field: "ch1Type", value: inputTypes[program] };
  if (program >= 2 && program <= 3) return { field: "ch2Type", value: inputTypes[program - 2] };
  if (program >= 4 && program <= 7) return { field: "assignA", value: sources[program - 4] };
  if (program >= 8 && program <= 11) return { field: "assignB", value: sources[program - 8] };
  if (program >= 12 && program <= 15) return { field: "assignPost", value: sources[program - 12] };
  if (program >= 16 && program <= 18) return { field: "ch1Mode", value: inputModes[program - 16] };
  if (program >= 19 && program <= 21) return { field: "ch2Mode", value: inputModes[program - 19] };
  if (program >= 22 && program <= 24) return { field: "returnSource", value: returnSources[program - 22] };
  if (program >= 25 && program <= 28) return { field: "headphoneSource", value: headphoneSources[program - 25] };
  if (program >= 29 && program <= 30) return { field: "sensor2", value: auxiliarySides[program - 29] };
  if (program >= 31 && program <= 32) return { field: "sensor3", value: auxiliarySides[program - 31] };
  if (program >= 33 && program <= 34) return { field: "reverseA", value: program === 34 };
  if (program >= 35 && program <= 36) return { field: "reverseB", value: program === 36 };
  if (program === 122 || program === 123) return { field: "magMode", value: program === 122 ? "CC" : "NOTE" };
  return null;
}

export function decodeConfigMessage(data: Uint8Array): DecodedConfigValue | null {
  if (data.length < 2) return null;

  const status = data[0];
  const messageType = status & 0xf0;
  const channel = status & 0x0f;
  if (channel !== MIDI_CHANNEL_15) return null;

  if (messageType === PROGRAM_CHANGE) return decodeProgramChange(data[1]);

  if (messageType === CONTROL_CHANGE && data.length >= 3) {
    const controller = data[1];
    if (controller === 20) return { field: "curveA", value: curveMidiCCToPercent(data[2]) };
    if (controller === 21) return { field: "curveB", value: curveMidiCCToPercent(data[2]) };
    if (controller === 22) {
      return { field: "dvsFaderDelayMs", value: normalizeDvsFaderDelayMs(data[2]) };
    }
  }

  return null;
}

export function isConfigDumpEndMessage(data: Uint8Array) {
  if (data.length < 2) return false;
  const status = data[0];
  const messageType = status & 0xf0;
  const channel = status & 0x0f;
  return channel === MIDI_CHANNEL_15
    && messageType === PROGRAM_CHANGE
    && (data[1] === 122 || data[1] === 123);
}

export function decodeMagneticLiveMessage(data: Uint8Array): MagneticLiveMessage | null {
  if (data.length < 3) return null;

  const status = data[0];
  const messageType = status & 0xf0;
  const channel = status & 0x0f;
  if (channel !== 0) return null;

  if (messageType === CONTROL_CHANGE) {
    const ccNumber = data[1];
    if (ccNumber < 12 || ccNumber > 15) return null;
    const value = data[2];
    return {
      index: (ccNumber - 12) as MagneticLiveMessage["index"],
      mode: "CC",
      value,
      active: value > 0,
    };
  }

  if (messageType === 0x90 || messageType === 0x80) {
    const noteNumber = data[1];
    if (noteNumber < 68 || noteNumber > 71) return null;
    const velocity = data[2];
    const active = messageType === 0x90 && velocity > 0;
    return {
      index: (noteNumber - 68) as MagneticLiveMessage["index"],
      mode: "NOTE",
      value: active ? velocity : 0,
      active,
    };
  }

  return null;
}
