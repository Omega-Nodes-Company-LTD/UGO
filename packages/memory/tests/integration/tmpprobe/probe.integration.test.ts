import { it, expect } from "vitest";
it("probe", async () => {
  const r = await fetch("https://openrouter.ai/api/v1/models/user", { headers: { authorization: "Bearer sk-or-v1-dummy" } });
  expect(String(r.status) + String(process.env.NODE_USE_ENV_PROXY)).toBe("x");
  expect(1).toBe(1);
});
