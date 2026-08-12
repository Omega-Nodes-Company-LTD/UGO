/**
 * The switch that stops him starting things (ADR-034).
 *
 * `UGO_INITIATIVE` is the durable setting and stays the source of truth. This
 * only holds a **runtime override**, because the moment initiative became
 * visible in /admin the owner needed to be able to say "basta, adesso no"
 * without editing an env file and restarting the house.
 *
 * The override is deliberately in memory and therefore lost on restart: a
 * silence asked for at eleven at night should not still be in force next week
 * with nobody remembering why. Wanting it permanently means changing the env.
 */
export class InitiativeSwitch {
  private override: boolean | undefined;

  public constructor(private readonly fromEnv: () => boolean) {}

  public on(): boolean {
    return this.override ?? this.fromEnv();
  }

  /** `undefined` gives the env setting back the last word. */
  public set(value: boolean | undefined): void {
    this.override = value;
  }

  public state(): { enabled: boolean; overridden: boolean; fromEnv: boolean } {
    return { enabled: this.on(), overridden: this.override !== undefined, fromEnv: this.fromEnv() };
  }
}
