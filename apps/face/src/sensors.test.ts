import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sensors } from "./sensors.js";

/**
 * La promessa di sensi spenti (ADR-011/016): «orecchie spente» deve spegnere
 * DAVVERO tutti i sensi accesi dal gesto — non solo il microfono. I listener
 * `devicemotion` e il sensore di luce erano rimasti attaccati a orecchie
 * spente, e un telefono con le orecchie spente continuava a rimbalzare shake
 * e lux sul filo: un sensore acceso quando l'interfaccia dice «sono spento».
 */

type MotionListener = (event: DeviceMotionEvent) => void;

const scope = globalThis as unknown as {
  window?: {
    addEventListener: ReturnType<typeof vi.fn> & ((type: string, listener: MotionListener) => void);
    removeEventListener: ReturnType<typeof vi.fn> & ((type: string, listener: MotionListener) => void);
  };
};

describe("Sensors — niente sensi accesi a sensi spenti", () => {
  beforeEach(() => {
    scope.window = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  });

  afterEach(() => {
    delete scope.window;
  });

  it("startMotion registra una sola volta e stopMotion rimuove lo stesso listener", () => {
    const sensors = new Sensors(() => undefined, () => undefined);

    sensors.startMotion();
    sensors.startMotion(); // guard: non si registra due volte

    expect(scope.window?.addEventListener).toHaveBeenCalledTimes(1);
    expect(scope.window?.addEventListener).toHaveBeenCalledWith("devicemotion", expect.any(Function));

    sensors.stopMotion();
    expect(scope.window?.removeEventListener).toHaveBeenCalledTimes(1);

    const added = (scope.window?.addEventListener.mock.calls[0] ?? [])[1] as MotionListener | undefined;
    const removed = (scope.window?.removeEventListener.mock.calls[0] ?? [])[1] as MotionListener | undefined;
    expect(added).toBe(removed); // è lo STESSO listener: la rimozione tocca davvero ciò che abbiamo aggiunto
  });
});