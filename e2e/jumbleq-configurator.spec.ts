import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  clearMidiMessages,
  disconnectMockDevice,
  disconnectMockDeviceOnUf2Arm,
  emitMockMidiMessage,
  installWebMidiMock,
  midiMessages,
  reconnectMockDevice,
  useMissingDvsFaderDelayConfig,
  useOldMidiMapConfig,
} from "./web-midi-mock";

const importedPreset = {
  ch1Type: "PHONO",
  ch2Type: "LINE",
  assignA: "USB 1/2",
  assignB: "USB 3/4",
  assignPost: "USB 1/2",
  ch1Mode: "DVS",
  ch2Mode: "SYNTH",
  returnSource: "None",
  headphoneSource: "Thru",
  sensor2: "B",
  sensor3: "A",
  magMode: "NOTE",
  curveA: 35,
  curveB: 65,
  dvsFaderDelayMs: 73,
  reverseA: true,
  reverseB: false,
};

test.beforeEach(async ({ page }) => {
  await installWebMidiMock(page);
  await page.goto("/", { waitUntil: "networkidle" });
});

test("shows the verified iPad MIDIWeb Browser guidance", async ({ page }) => {
  await page.getByRole("button", { name: "Open help" }).click();

  const midiWebBrowserLink = page.getByRole("link", { name: /MIDIWeb Browser/ });
  await expect(midiWebBrowserLink).toHaveAttribute(
    "href",
    "https://apps.apple.com/jp/app/midiweb-browser/id6757226617?l=en-US",
  );
  await expect(page.getByText("Connection and MIDI communication are verified on iPadOS 26.5.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Firmware update" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Firmware update guide" })).toHaveAttribute(
    "href",
    "https://github.com/yamamo2shun1/JUMBLEQ/blob/main/Docs/user-guide/firmware-update.md",
  );
});

test("groups audio routing and MIDI controls by function", async ({ page }) => {
  const navigation = page.getByRole("navigation", { name: "Configurator sections" });
  await expect(navigation.getByRole("link")).toHaveText(["Audio", "MIDI", "Device"]);
  await expect(page.getByText("Configurator preview · v0.9.8")).toBeVisible();

  const audioSettings = page.locator("#audio");
  await expect(page.getByRole("heading", { name: "Audio settings" })).toBeVisible();
  await expect(page.locator(".page-heading > .page-heading-description")).toHaveText("Configure analog inputs, signal routing, monitoring, and channel-fader response.");
  await expect(audioSettings.getByRole("heading", { name: "Monitor routing" })).toBeVisible();
  await expect(audioSettings.getByRole("heading", { name: "Return routing" })).toBeVisible();
  await expect(audioSettings.getByRole("heading", { name: "Response curves" })).toBeVisible();
  await expect(audioSettings.getByText("CHANNEL FADER ROUTING")).toBeVisible();
  await expect(audioSettings.getByText("CHANNEL FADERS", { exact: true })).toBeVisible();
  await expect(audioSettings.locator(".curve-card + .routing-settings-grid")).toHaveCount(1);

  const midiSettings = page.locator("#midi");
  await expect(midiSettings.getByRole("heading", { name: "MIDI settings" })).toBeVisible();
  await expect(midiSettings.getByRole("heading", { name: "Magnetic switches" })).toBeVisible();
  await expect(midiSettings.getByRole("heading", { name: "Monitor routing" })).toHaveCount(0);
});

test("draws independent firmware curves with opposite A/B directions", async ({ page }) => {
  const curveA = page.getByLabel("Fader A curve", { exact: true });
  const curveB = page.getByLabel("Fader B curve", { exact: true });

  await expect(page.getByText("0 (late) - 64 (linear) - 127 (early)", { exact: true })).toBeVisible();
  await curveA.fill("0");
  await curveB.fill("100");

  const pathANormal = await page.locator(".curve-a").getAttribute("d");
  const pathBNormal = await page.locator(".curve-b").getAttribute("d");
  expect(pathANormal).not.toBe(pathBNormal);
  expect(pathANormal).toMatch(/^M 18\.00 20\.00 /);
  expect(pathANormal).toMatch(/L 302\.00 144\.00$/);
  expect(pathBNormal).toMatch(/^M 18\.00 144\.00 /);
  expect(pathBNormal).toMatch(/L 302\.00 20\.00$/);
  await expect(page.locator(".curve-control-a output")).toHaveText("CC 0");
  await expect(page.locator(".curve-control-b output")).toHaveText("CC 127");

  await page.getByRole("switch", { name: "Fader A reverse" }).click();
  await page.getByRole("switch", { name: "Fader B reverse" }).click();
  const pathAReverse = await page.locator(".curve-a").getAttribute("d");
  const pathBReverse = await page.locator(".curve-b").getAttribute("d");
  expect(pathAReverse).toMatch(/^M 18\.00 144\.00 /);
  expect(pathAReverse).toMatch(/L 302\.00 20\.00$/);
  expect(pathBReverse).toMatch(/^M 18\.00 20\.00 /);
  expect(pathBReverse).toMatch(/L 302\.00 144\.00$/);
});

test("labels physical routing sources as analog inputs", async ({ page }) => {
  const faderA = page.getByRole("combobox", { name: "Fader A", exact: true });

  await expect(faderA.locator("option")).toHaveText(["ANALOG 1", "ANALOG 2", "USB 1/2", "USB 3/4"]);
  await faderA.selectOption("CH 2");
  await expect(faderA).toHaveValue("CH 2");
  await expect(faderA.locator("option:checked")).toHaveText("ANALOG 2");
});

test("reroutes and disables conflicting sources before enabling DVS or SYNTH", async ({ page }) => {
  await page.getByRole("button", { name: "Connect device" }).click();
  await expect(page.getByRole("button", { name: "JUMBLEQ connected" })).toBeVisible();

  const ch1Off = page.getByRole("button", { name: "Channel 1 mode OFF" });
  const ch1Dvs = page.getByRole("button", { name: "Channel 1 mode DVS" });
  const ch2Off = page.getByRole("button", { name: "Channel 2 mode OFF" });
  const ch2Synth = page.getByRole("button", { name: "Channel 2 mode SYNTH" });
  const faderA = page.getByRole("combobox", { name: "Fader A", exact: true });
  const faderB = page.getByRole("combobox", { name: "Fader B", exact: true });
  const postFader = page.getByRole("combobox", { name: "Post fader", exact: true });
  const returnInput = page.getByLabel("USB return input");

  await ch1Off.click();
  await ch2Off.click();
  await faderA.selectOption("CH 1");
  await faderB.selectOption("CH 1");
  await postFader.selectOption("CH 1");
  await returnInput.selectOption("USB 1/2");
  await clearMidiMessages(page);

  await ch1Dvs.click();

  await expect(faderA).toHaveValue("USB 1/2");
  await expect(faderB).toHaveValue("USB 1/2");
  await expect(postFader).toHaveValue("USB 1/2");
  await expect(faderA.locator('option[value="CH 1"]')).toHaveAttribute("disabled", "");
  await expect(faderB.locator('option[value="CH 1"]')).toHaveAttribute("disabled", "");
  await expect(postFader.locator('option[value="CH 1"]')).toHaveAttribute("disabled", "");
  await expect(returnInput).toHaveValue("None");
  await expect(returnInput.locator('option[value="USB 1/2"]')).toHaveAttribute("disabled", "");
  await expect(returnInput.locator('option[value="USB 3/4"]')).not.toBeDisabled();
  expect(await midiMessages(page)).toEqual([
    [0xce, 6],
    [0xce, 10],
    [0xce, 14],
    [0xce, 24],
    [0xce, 17],
  ]);

  await faderA.selectOption("CH 2");
  await faderB.selectOption("CH 2");
  await postFader.selectOption("CH 2");
  await returnInput.selectOption("USB 3/4");
  await clearMidiMessages(page);

  await ch2Synth.click();

  await expect(faderA).toHaveValue("USB 3/4");
  await expect(faderB).toHaveValue("USB 3/4");
  await expect(postFader).toHaveValue("USB 3/4");
  await expect(faderA.locator('option[value="CH 2"]')).toHaveAttribute("disabled", "");
  await expect(faderB.locator('option[value="CH 2"]')).toHaveAttribute("disabled", "");
  await expect(postFader.locator('option[value="CH 2"]')).toHaveAttribute("disabled", "");
  await expect(returnInput).toHaveValue("None");
  await expect(returnInput.locator('option[value="USB 1/2"]')).toHaveAttribute("disabled", "");
  await expect(returnInput.locator('option[value="USB 3/4"]')).toHaveAttribute("disabled", "");
  expect(await midiMessages(page)).toEqual([
    [0xce, 7],
    [0xce, 11],
    [0xce, 15],
    [0xce, 24],
    [0xce, 21],
  ]);

  await clearMidiMessages(page);
  await page.getByRole("button", { name: "Channel 1 mode SYNTH" }).click();
  expect(await midiMessages(page)).toEqual([[0xce, 18]]);

  await clearMidiMessages(page);
  await ch1Off.click();
  await expect(faderA).toHaveValue("USB 3/4");
  await expect(faderB).toHaveValue("USB 3/4");
  await expect(postFader).toHaveValue("USB 3/4");
  await expect(returnInput).toHaveValue("None");
  expect(await midiMessages(page)).toEqual([[0xce, 16]]);
});

test("sends the exact Program Change value for every input mode", async ({ page }) => {
  await page.getByRole("button", { name: "Connect device" }).click();
  await expect(page.getByRole("button", { name: "JUMBLEQ connected" })).toBeVisible();
  await clearMidiMessages(page);

  for (const [channel, mode] of [
    [1, "OFF"],
    [1, "DVS"],
    [1, "SYNTH"],
    [2, "OFF"],
    [2, "DVS"],
    [2, "SYNTH"],
  ] as const) {
    await page.getByRole("button", { name: `Channel ${channel} mode ${mode}` }).click();
  }

  expect(await midiMessages(page)).toEqual([
    [0xce, 16],
    [0xce, 17],
    [0xce, 18],
    [0xce, 19],
    [0xce, 20],
    [0xce, 21],
  ]);
  await expect(page.getByText("Delays magnetic-switch channel-fader changes only while DVS is enabled. Shared by Input Ch. 1 and Input Ch. 2.")).toBeVisible();

  await clearMidiMessages(page);
  await page.getByRole("button", { name: "Restore defaults" }).click();
  await expect(page.getByRole("button", { name: "Channel 1 mode OFF" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Channel 2 mode OFF" })).toHaveAttribute("aria-pressed", "true");
  expect(await midiMessages(page)).toEqual(expect.arrayContaining([[0xce, 16], [0xce, 19]]));
});

test("connects to JUMBLEQ and reflects the complete initial sync", async ({ page }) => {
  await page.getByRole("button", { name: "Connect device" }).click();

  await expect(page.getByRole("button", { name: "JUMBLEQ connected" })).toBeVisible();
  await expect(page.getByText("Current settings loaded from JUMBLEQ")).toBeVisible();
  await expect(page.getByText("17/17 synced")).toBeVisible();
  await expect(page.getByRole("group", { name: "Channel 2 input type" }).getByRole("button", { name: "PHONO" })).toHaveClass(/active/);
  await expect(page.getByRole("button", { name: "Channel 1 mode DVS" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Channel 2 mode SYNTH" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("combobox", { name: "Fader A", exact: true })).toHaveValue("USB 3/4");
  await expect(page.getByLabel("Headphone monitor source")).toHaveValue("Fader B");
  await expect(page.getByLabel("USB return input")).toHaveValue("None");
  await expect(page.getByRole("button", { name: "MIDI note" })).toHaveClass(/active/);
  await expect(page.getByLabel("Fader A curve", { exact: true })).toHaveValue("25");
  await expect(page.getByLabel("Fader B curve", { exact: true })).toHaveValue("75");
  await expect(page.getByRole("slider", { name: "DVS Fader Delay" })).toHaveValue("42");
  await expect(page.getByRole("switch", { name: "Fader A reverse" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("switch", { name: "Fader B reverse" })).toHaveAttribute("aria-checked", "false");
  await expect(page.locator(".curve-control-a .fader-reverse-setting")).toContainText("Reverse");
  await expect(page.locator(".curve-control-b .fader-reverse-setting")).toContainText("Normal");
  await emitMockMidiMessage(page, [0xb0, 22, 120]);
  await expect(page.getByRole("slider", { name: "DVS Fader Delay" })).toHaveValue("42");
  expect(await midiMessages(page)).toContainEqual([0xce, 126]);
});

test("sends setting, curve edit, and EEPROM save messages", async ({ page }) => {
  await page.getByRole("button", { name: "Connect device" }).click();
  await expect(page.getByRole("button", { name: "JUMBLEQ connected" })).toBeVisible();
  await clearMidiMessages(page);

  await page.getByRole("group", { name: "Channel 1 input type" }).getByRole("button", { name: "PHONO" }).click();
  await page.getByRole("combobox", { name: "Fader A", exact: true }).selectOption("USB 3/4");
  await page.getByRole("button", { name: "Channel 1 mode OFF" }).click();
  await page.getByLabel("USB return input").selectOption("None");
  const curveA = page.getByLabel("Fader A curve", { exact: true });
  await curveA.fill("80");
  await curveA.blur();
  const dvsFaderDelay = page.getByRole("slider", { name: "DVS Fader Delay" });
  await dvsFaderDelay.fill("120");
  await dvsFaderDelay.blur();
  await page.getByRole("switch", { name: "Fader A reverse" }).click();
  await page.getByRole("switch", { name: "Fader B reverse" }).click();
  await page.getByRole("button", { name: "Save to device" }).click();

  await expect(page.getByText("Save command sent to JUMBLEQ")).toBeVisible();
  const sentMessages = await midiMessages(page);
  expect(sentMessages).toEqual(expect.arrayContaining([
    [0xce, 1],
    [0xce, 7],
    [0xce, 16],
    [0xce, 24],
    [0xce, 121],
    [0xbe, 20, 102],
    [0xbe, 22, 120],
    [0xce, 120],
    [0xce, 33],
    [0xce, 36],
    [0xce, 127],
  ]));
  const delayMessageIndex = sentMessages.findIndex((message) => (
    message[0] === 0xbe && message[1] === 22 && message[2] === 120
  ));
  expect(sentMessages[delayMessageIndex - 1]).toEqual([0xce, 121]);
  expect(sentMessages[delayMessageIndex + 1]).toEqual([0xce, 120]);
});

test("normalizes leading zeroes in the DVS fader delay number input", async ({ page }) => {
  const delayInput = page.getByRole("spinbutton", { name: "DVS Fader Delay numeric value" });
  await delayInput.fill("0015");

  await expect(delayInput).toHaveValue("15");
  await expect(page.getByRole("slider", { name: "DVS Fader Delay" })).toHaveValue("15");
});

test("visualizes magnetic CC values and Note velocities on their hardware keys", async ({ page }) => {
  await page.getByRole("button", { name: "Connect device" }).click();
  await expect(page.getByRole("button", { name: "JUMBLEQ connected" })).toBeVisible();

  const topLeftMidi = page.getByTestId("magnetic-midi-0");
  await emitMockMidiMessage(page, [0x90, 68, 104]);
  await expect(topLeftMidi).toHaveClass(/is-live/);
  await expect(topLeftMidi.locator("small")).toHaveText("VEL 104");
  expect(await topLeftMidi.evaluate((element) => (
    Number.parseFloat((element as HTMLElement).style.getPropertyValue("--midi-level"))
  ))).toBeGreaterThan(80);

  await emitMockMidiMessage(page, [0x80, 68, 0]);
  await expect(topLeftMidi).not.toHaveClass(/is-live/);
  await expect(topLeftMidi.locator("small")).toHaveText("VEL 104");
  await expect(topLeftMidi.locator("small")).toHaveText("NOTE", { timeout: 2_000 });

  const bottomLeftMidi = page.locator(".key-bottom-midi-a");
  await emitMockMidiMessage(page, [0x90, 69, 80]);
  await expect(bottomLeftMidi).toHaveClass(/is-live/);
  await expect(bottomLeftMidi.locator("small")).toHaveText("VEL 080");
  await emitMockMidiMessage(page, [0x80, 69, 0]);

  const topRightMidi = page.locator(".key-top-midi-b");
  await emitMockMidiMessage(page, [0x90, 70, 72]);
  await expect(topRightMidi).toHaveClass(/is-live/);
  await expect(topRightMidi.locator("small")).toHaveText("VEL 072");
  await emitMockMidiMessage(page, [0x80, 70, 0]);

  await page.getByRole("button", { name: "Control change" }).click();
  await emitMockMidiMessage(page, [0xb0, 13, 80]);
  await expect(bottomLeftMidi).toHaveClass(/is-live/);
  await expect(bottomLeftMidi.locator("small")).toHaveText("CC 080");
  await emitMockMidiMessage(page, [0xb0, 13, 0]);

  await emitMockMidiMessage(page, [0xb0, 14, 72]);
  await expect(topRightMidi).toHaveClass(/is-live/);
  await expect(topRightMidi.locator("small")).toHaveText("CC 072");
  await emitMockMidiMessage(page, [0xb0, 14, 0]);

  const bottomRightMidi = page.getByTestId("magnetic-midi-3");
  await emitMockMidiMessage(page, [0xb0, 15, 96]);
  await expect(bottomRightMidi).toHaveClass(/is-live/);
  await expect(bottomRightMidi.locator("small")).toHaveText("CC 096");

  await emitMockMidiMessage(page, [0xb0, 15, 0]);
  await expect(bottomRightMidi).not.toHaveClass(/is-live/);
  await expect(bottomRightMidi.locator("small")).toHaveText("CC 000");
  await expect(bottomRightMidi.locator("small")).toHaveText("CC", { timeout: 2_000 });
});

test("automatically reconnects and synchronizes after a USB interruption", async ({ page }) => {
  await page.getByRole("button", { name: "Connect device" }).click();
  await expect(page.getByRole("button", { name: "JUMBLEQ connected" })).toBeVisible();
  await clearMidiMessages(page);

  await disconnectMockDevice(page);
  await expect(page.getByRole("button", { name: "Reconnecting…" })).toBeVisible();
  await reconnectMockDevice(page);

  await expect(page.getByRole("button", { name: "JUMBLEQ connected" })).toBeVisible();
  await expect(page.getByText("17/17 synced")).toBeVisible();
  expect(await midiMessages(page)).toContainEqual([0xce, 126]);
});

test("requires confirmation before sending one UF2 arm request and discloses unsaved settings", async ({ page }) => {
  const enterUf2Button = page.getByRole("button", { name: "Enter UF2 mode" });
  await expect(enterUf2Button).toBeDisabled();

  await page.getByRole("button", { name: "Connect device" }).click();
  await expect(page.getByRole("button", { name: "JUMBLEQ connected" })).toBeVisible();
  await page.getByRole("group", { name: "Channel 1 input type" }).getByRole("button", { name: "PHONO" }).click();
  await clearMidiMessages(page);

  await enterUf2Button.click();
  const dialog = page.getByRole("dialog", { name: "Enter UF2 bootloader mode?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Physical confirmation required")).toBeVisible();
  await expect(dialog.getByText("There are unsaved changes.")).toBeVisible();
  expect(await midiMessages(page)).toEqual([]);

  await dialog.getByRole("button", { name: "Arm UF2 mode" }).click();
  await expect(page.getByRole("dialog", { name: "Request sent" })).toBeVisible();
  await expect(page.getByText("seconds remaining")).toBeVisible();
  expect(await midiMessages(page)).toEqual([[0xce, 124]]);

  await page.getByRole("button", { name: "Cancel request" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await midiMessages(page)).toEqual([[0xce, 124], [0xce, 125]]);
  expect(await midiMessages(page)).not.toContainEqual([0xce, 127]);

  await clearMidiMessages(page);
  await enterUf2Button.click();
  await page.getByRole("button", { name: "Arm UF2 mode" }).click();
  await page.getByRole("dialog", { name: "Request sent" }).getByRole("button", { name: "Close UF2 dialog" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await midiMessages(page)).toEqual([[0xce, 124], [0xce, 125]]);
});

test("ends curve editing before arming and Escape cancels the active request", async ({ page }) => {
  await page.getByRole("button", { name: "Connect device" }).click();
  await expect(page.getByRole("button", { name: "JUMBLEQ connected" })).toBeVisible();

  const curveA = page.getByLabel("Fader A curve", { exact: true });
  await curveA.focus();
  await expect(page.getByText("Curve edit active")).toBeVisible();
  await clearMidiMessages(page);

  await page.getByRole("button", { name: "Enter UF2 mode" }).click();
  await page.getByRole("button", { name: "Arm UF2 mode" }).click();
  const messagesAfterArm = await midiMessages(page);
  const curveOffIndex = messagesAfterArm.findIndex((message) => message[0] === 0xce && message[1] === 120);
  const uf2ArmIndex = messagesAfterArm.findIndex((message) => message[0] === 0xce && message[1] === 124);
  expect(curveOffIndex).toBeGreaterThanOrEqual(0);
  expect(uf2ArmIndex).toBeGreaterThan(curveOffIndex);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await midiMessages(page)).toContainEqual([0xce, 125]);
  await expect(page.getByRole("button", { name: "Enter UF2 mode" })).toBeFocused();
});

test("expires an ignored UF2 request safely and remains usable", async ({ page }) => {
  test.setTimeout(20_000);
  await page.getByRole("button", { name: "Connect device" }).click();
  await expect(page.getByRole("button", { name: "JUMBLEQ connected" })).toBeVisible();
  await clearMidiMessages(page);

  await page.getByRole("button", { name: "Enter UF2 mode" }).click();
  await page.getByRole("button", { name: "Arm UF2 mode" }).click();
  await expect(page.getByRole("dialog", { name: "Request expired" })).toBeVisible({ timeout: 12_000 });
  expect(await midiMessages(page)).toEqual([[0xce, 124], [0xce, 125]]);

  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("dialog", { name: "Request sent" })).toBeVisible();
  expect(await midiMessages(page)).toEqual([[0xce, 124], [0xce, 125], [0xce, 124]]);
  await page.getByRole("button", { name: "Cancel request" }).click();
  await expect(page.getByRole("button", { name: "Read from device" })).toBeEnabled();
});

test("treats MIDI disappearance after UF2 arm as expected and resynchronizes on return", async ({ page }) => {
  await page.getByRole("button", { name: "Connect device" }).click();
  await expect(page.getByRole("button", { name: "JUMBLEQ connected" })).toBeVisible();
  await clearMidiMessages(page);
  await disconnectMockDeviceOnUf2Arm(page);

  await page.getByRole("button", { name: "Enter UF2 mode" }).click();
  await page.getByRole("button", { name: "Arm UF2 mode" }).click();
  const transitionDialog = page.getByRole("dialog", { name: "JUMBLEQ MIDI disconnected" });
  await expect(transitionDialog).toBeVisible();
  await expect(transitionDialog.getByText("Check that the JUMBLEQ UF2 drive appears")).toBeVisible();
  await expect(page.getByText("Automatic reconnect failed")).toHaveCount(0);
  expect(await midiMessages(page)).toEqual([[0xce, 124]]);

  await reconnectMockDevice(page);
  await expect(page.getByRole("button", { name: "JUMBLEQ connected" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await midiMessages(page)).toContainEqual([0xce, 126]);
});

test("keeps the UF2 dialog keyboard-accessible at a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await page.getByRole("button", { name: "Connect device" }).click();
  await expect(page.getByRole("button", { name: "JUMBLEQ connected" })).toBeVisible();

  const enterUf2Button = page.getByRole("button", { name: "Enter UF2 mode" });
  await enterUf2Button.click();
  const dialog = page.getByRole("dialog", { name: "Enter UF2 bootloader mode?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  const box = await dialog.boundingBox();
  expect(box?.width).toBeLessThanOrEqual(390);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(enterUf2Button).toBeFocused();
});

test("keeps input mode choices keyboard-accessible at a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  const channelCard = page.getByRole("article", { name: "Channel 1 input" });
  const modeGroup = channelCard.getByRole("group", { name: "Channel 1 input mode" });
  const synthMode = modeGroup.getByRole("button", { name: "Channel 1 mode SYNTH" });

  await synthMode.focus();
  await page.keyboard.press("Space");
  await expect(synthMode).toHaveAttribute("aria-pressed", "true");
  await expect(channelCard.getByText("Synth mode")).toBeVisible();

  const cardBox = await channelCard.boundingBox();
  const modeBox = await modeGroup.boundingBox();
  expect(modeBox?.width).toBeLessThanOrEqual(cardBox?.width ?? 0);
});

test("imports a validated preset and exports the same settings", async ({ page }) => {
  await page.getByLabel("Import preset file").setInputFiles({
    name: "test-preset.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(importedPreset)),
  });

  await expect(page.getByText("Preset imported into the preview.")).toBeVisible();
  await expect(page.getByRole("group", { name: "Channel 1 input type" }).getByRole("button", { name: "PHONO" })).toHaveClass(/active/);
  await expect(page.getByRole("combobox", { name: "Fader A", exact: true })).toHaveValue("USB 1/2");
  await expect(page.getByLabel("USB return input")).toHaveValue("None");
  await expect(page.getByLabel("Headphone monitor source")).toHaveValue("Thru");
  await expect(page.getByLabel("Fader A curve", { exact: true })).toHaveValue("35");
  await expect(page.getByLabel("Fader B curve", { exact: true })).toHaveValue("65");
  await expect(page.getByRole("slider", { name: "DVS Fader Delay" })).toHaveValue("73");
  await expect(page.getByRole("button", { name: "Channel 1 mode DVS" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Channel 2 mode SYNTH" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("switch", { name: "Fader A reverse" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("switch", { name: "Fader B reverse" })).toHaveAttribute("aria-checked", "false");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export preset" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("jumbleq-preset.json");
  const path = await download.path();
  expect(path).not.toBeNull();
  expect(JSON.parse(await readFile(path!, "utf8"))).toEqual(importedPreset);
});

test("migrates legacy DVS booleans when importing a preset", async ({ page }) => {
  const legacyPreset: Record<string, unknown> = {
    ...importedPreset,
    dvs1: true,
    dvs2: false,
  };
  delete legacyPreset.ch1Mode;
  delete legacyPreset.ch2Mode;

  await page.getByLabel("Import preset file").setInputFiles({
    name: "legacy-preset.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(legacyPreset)),
  });

  await expect(page.getByRole("button", { name: "Channel 1 mode DVS" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Channel 2 mode OFF" })).toHaveAttribute("aria-pressed", "true");
});

test("falls back to a fixed 50 ms delay for older firmware", async ({ page }) => {
  await useMissingDvsFaderDelayConfig(page);
  await page.getByRole("button", { name: "Connect device" }).click();

  await expect(page.getByRole("button", { name: "JUMBLEQ connected" })).toBeVisible();
  await expect(page.getByText("17/17 synced")).toBeVisible();
  await expect(page.getByRole("slider", { name: "DVS Fader Delay" })).toHaveValue("50");
  await expect(page.getByRole("slider", { name: "DVS Fader Delay" })).toBeDisabled();
  await expect(page.getByText(/Requires JUMBLEQ firmware v0\.14\.3/)).toBeVisible();
});

test("rejects firmware using the older MIDI configuration map", async ({ page }) => {
  await useOldMidiMapConfig(page);
  await page.getByRole("button", { name: "Connect device" }).click();

  await expect(page.getByText("This JUMBLEQ firmware uses an older MIDI configuration map. Update the firmware before using this Configurator version.")).toBeVisible();
  await expect(page.getByRole("button", { name: "JUMBLEQ connected" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Channel 1 mode SYNTH" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Restore defaults" })).toBeDisabled();
  expect(await midiMessages(page)).toEqual([[0xce, 126]]);
});
