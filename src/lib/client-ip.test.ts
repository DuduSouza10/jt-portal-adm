import { describe, expect, it } from "vitest";
import { pickClientIp, UNKNOWN_IP } from "./client-ip";

const headers = (h: Record<string, string>) => (name: string) => h[name] ?? null;
const forged = { "x-forwarded-for": "6.6.6.6", "x-nf-client-connection-ip": "7.7.7.7", "x-real-ip": "8.8.8.8" };

describe("pickClientIp", () => {
  it("Netlify: só o cabeçalho do Netlify", () => {
    expect(pickClientIp(headers(forged), { NODE_ENV: "production", NETLIFY: "true" })).toBe("7.7.7.7");
  });

  it("Vercel: x-real-ip, nunca o cabeçalho do Netlify (que o cliente poderia forjar)", () => {
    expect(pickClientIp(headers(forged), { NODE_ENV: "production", VERCEL: "1" })).toBe("8.8.8.8");
    expect(pickClientIp(headers({ "x-vercel-forwarded-for": "9.9.9.9, 1.1.1.1" }), { NODE_ENV: "production", VERCEL: "1" })).toBe("9.9.9.9");
  });

  it("outra hospedagem: cabeçalho configurado", () => {
    expect(pickClientIp(headers({ "cf-connecting-ip": "5.5.5.5" }), { NODE_ENV: "production", TRUSTED_IP_HEADER: "CF-Connecting-IP" })).toBe("5.5.5.5");
  });

  it("produção sem cabeçalho confiável: desconhecido (não confia em x-forwarded-for)", () => {
    expect(pickClientIp(headers(forged), { NODE_ENV: "production" })).toBe(UNKNOWN_IP);
  });

  it("desenvolvimento: x-forwarded-for ou local", () => {
    expect(pickClientIp(headers({ "x-forwarded-for": "10.0.0.1, 10.0.0.2" }), { NODE_ENV: "development" })).toBe("10.0.0.1");
    expect(pickClientIp(headers({}), { NODE_ENV: "development" })).toBe("local");
  });
});
