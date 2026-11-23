import { afterEach, describe, expect, it, vi } from "vitest";
import { devLoginState, devPasswordOk } from "./auth-config";

afterEach(() => { vi.unstubAllEnvs(); });

describe("developer sign-in password", () => {
  it("is refused in production without a password", () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("AUTH_DEV_LOGIN", "true"); vi.stubEnv("AUTH_DEV_PASSWORD", "");
    expect(devLoginState().blocked).toMatch(/AUTH_DEV_PASSWORD/);
    expect(devPasswordOk("anything")).toBe(false);
  });

  it("needs the right password in production", () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("AUTH_DEV_LOGIN", "true"); vi.stubEnv("AUTH_DEV_PASSWORD", "correct horse");
    expect(devLoginState()).toEqual({ enabled: true, needsPassword: true, blocked: null });
    expect(devPasswordOk("correct horse")).toBe(true);
    expect(devPasswordOk("wrong")).toBe(false);
    expect(devPasswordOk(undefined)).toBe(false);
  });

  it("is open without a password in development, and uses one when set", () => {
    vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("AUTH_DEV_LOGIN", ""); vi.stubEnv("AUTH_DEV_PASSWORD", "");
    expect(devPasswordOk(undefined)).toBe(true);
    vi.stubEnv("AUTH_DEV_PASSWORD", "pw");
    expect(devPasswordOk(undefined)).toBe(false);
    expect(devPasswordOk("pw")).toBe(true);
  });

  it("is off when AUTH_DEV_LOGIN is not true in production", () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("AUTH_DEV_LOGIN", ""); vi.stubEnv("AUTH_DEV_PASSWORD", "pw");
    expect(devLoginState().enabled).toBe(false);
    expect(devPasswordOk("pw")).toBe(false);
  });
});
