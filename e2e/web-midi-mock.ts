import type { Page } from "@playwright/test";

type JumbleqMidiMock = {
  messages: number[][];
  clearMessages: () => void;
  disconnect: () => void;
  disconnectOnUf2Arm: () => void;
  emit: (data: number[]) => void;
  reconnect: () => void;
  useMissingDvsFaderDelayConfig: () => void;
  useOldMidiMapConfig: () => void;
};

declare global {
  interface Window {
    __jumbleqMidiMock: JumbleqMidiMock;
  }
}

export async function installWebMidiMock(page: Page) {
  await page.addInitScript(() => {
    type MidiState = "connected" | "disconnected";
    type MidiMessageHandler = ((event: { data: Uint8Array }) => void) | null;

    let configMessages = [
      [0xce, 0],
      [0xce, 3],
      [0xce, 7],
      [0xce, 10],
      [0xce, 14],
      [0xce, 17],
      [0xce, 21],
      [0xce, 24],
      [0xce, 26],
      [0xce, 30],
      [0xce, 31],
      [0xce, 34],
      [0xce, 35],
      [0xbe, 20, 32],
      [0xbe, 21, 95],
      [0xbe, 22, 42],
      [0xce, 123],
    ];
    const sentMessages: number[][] = [];
    const stateListeners = new Set<() => void>();
    let shouldDisconnectOnUf2Arm = false;

    const input = {
      id: "jumbleq-input",
      manufacturer: "Microsoft Corporation",
      name: "JUMBLEQ MIDI",
      state: "connected" as MidiState,
      onmidimessage: null as MidiMessageHandler,
      async open() { return input; },
      async close() { return input; },
    };

    const output = {
      id: "jumbleq-output",
      manufacturer: "Microsoft Corporation",
      name: "JUMBLEQ MIDI",
      state: "connected" as MidiState,
      async open() { return output; },
      async close() { return output; },
      send(data: Uint8Array | number[]) {
        const message = Array.from(data);
        sentMessages.push(message);
        if (message[0] === 0xce && message[1] === 126) {
          window.setTimeout(() => {
            for (const configMessage of configMessages) {
              input.onmidimessage?.({ data: new Uint8Array(configMessage) });
            }
          }, 0);
        }
        if (message[0] === 0xce && message[1] === 124 && shouldDisconnectOnUf2Arm) {
          window.setTimeout(() => {
            input.state = "disconnected";
            output.state = "disconnected";
            notifyStateChange();
          }, 0);
        }
      },
    };

    const access = {
      inputs: new Map([[input.id, input]]),
      outputs: new Map([[output.id, output]]),
      addEventListener(type: string, listener: () => void) {
        if (type === "statechange") stateListeners.add(listener);
      },
      removeEventListener(type: string, listener: () => void) {
        if (type === "statechange") stateListeners.delete(listener);
      },
    };

    const notifyStateChange = () => {
      for (const listener of stateListeners) listener();
    };

    Object.defineProperty(navigator, "requestMIDIAccess", {
      configurable: true,
      value: async () => access,
    });

    window.__jumbleqMidiMock = {
      messages: sentMessages,
      clearMessages() {
        sentMessages.length = 0;
      },
      disconnect() {
        input.state = "disconnected";
        output.state = "disconnected";
        notifyStateChange();
      },
      disconnectOnUf2Arm() {
        shouldDisconnectOnUf2Arm = true;
      },
      emit(data) {
        input.onmidimessage?.({ data: new Uint8Array(data) });
      },
      reconnect() {
        input.state = "connected";
        output.state = "connected";
        notifyStateChange();
      },
      useMissingDvsFaderDelayConfig() {
        configMessages = configMessages.filter((message) => !(message[0] === 0xbe && message[1] === 22));
      },
      useOldMidiMapConfig() {
        configMessages = [
          [0xce, 0],
          [0xce, 3],
          [0xce, 7],
          [0xce, 8],
          [0xce, 14],
          [0xce, 17],
          [0xce, 18],
          [0xce, 22],
          [0xce, 24],
          [0xce, 28],
          [0xce, 29],
          [0xce, 32],
          [0xce, 33],
          [0xbe, 20, 32],
          [0xbe, 21, 95],
          [0xbe, 22, 42],
          [0xce, 123],
        ];
      },
    };
  });
}

export async function midiMessages(page: Page) {
  return page.evaluate(() => window.__jumbleqMidiMock.messages);
}

export async function clearMidiMessages(page: Page) {
  await page.evaluate(() => window.__jumbleqMidiMock.clearMessages());
}

export async function disconnectMockDevice(page: Page) {
  await page.evaluate(() => window.__jumbleqMidiMock.disconnect());
}

export async function disconnectMockDeviceOnUf2Arm(page: Page) {
  await page.evaluate(() => window.__jumbleqMidiMock.disconnectOnUf2Arm());
}

export async function reconnectMockDevice(page: Page) {
  await page.evaluate(() => window.__jumbleqMidiMock.reconnect());
}

export async function emitMockMidiMessage(page: Page, data: number[]) {
  await page.evaluate((message) => window.__jumbleqMidiMock.emit(message), data);
}

export async function useMissingDvsFaderDelayConfig(page: Page) {
  await page.evaluate(() => window.__jumbleqMidiMock.useMissingDvsFaderDelayConfig());
}

export async function useOldMidiMapConfig(page: Page) {
  await page.evaluate(() => window.__jumbleqMidiMock.useOldMidiMapConfig());
}
