import { afterEach, describe, expect, it, vi } from "vitest";
import { Sensors } from "./sensors.js";

/**
 * La promessa di sensi spenti (ADR-011/016): «orecchie spente» deve spegnere
 * DAVVERO tutti i sensi accesi dal gesto — non solo il microfono. I listener
 * `devicemotion` e il sensore di luce erano rimasti attaccati a orecchie
 * spente, e un telefono con le orecchie spente continuava a rimbalzare shake
 * e lux sul filo: un sensore acceso quando l'interfaccia dice «sono spento».
 */

type MotionListener = (event: DeviceMotionEvent) => void;

interface WindowLike {
  addEventListener: (type: string, listener: MotionListener) => void;
  removeEventListener: (type: string, listener: MotionListener) => void;
}

const mockWindow: WindowLike & {
  addEvents: MotionListener[];
  removeEvents: MotionListener[];
} = {
  addEvents: [],
  removeEvents: [],
  addEventListener(type, listener) {
    this.addEvents.push(listener);
  },
  removeEventListener(type, listener) {
    this.removeEvents.push(listener);
  },
};

describe("Sensors — niente sensi accesi a sensi spenti", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    mockWindow.addEvents = [];
    mockWindow.removeEvents = [];
  });

  it("startMotion registra una sola volta e stopMotion rimuove lo stesso listener", () => {
    vi.stubGlobal("window", mockWindow);
    const sensors = new Sensors(() => undefined, () => undefined);

    sensors.startMotion();
    sensors.startMotion(); // guard: non si registra due volte

    expect(mockWindow.addEvents).toHaveLength(1);

    sensors.stopMotion();
    expect(mockWindow.removeEvents).toHaveLength(1);

    expect(mockWindow.removeEvents[0]).toBe(mockWindow.addEvents[0]); // lo STESSO listener
  });
});