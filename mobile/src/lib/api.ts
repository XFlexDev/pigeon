import * as SecureStore from "expo-secure-store";

const BASE = "https://pigeon.kreatix.dev";
let token: string | null = null;

export async function loadToken() {
  token = await SecureStore.getItemAsync("pigeon:token");
  return token;
}
export async function setToken(t: string | null) {
  token = t;
  if (t) await SecureStore.setItemAsync("pigeon:token", t);
  else await SecureStore.deleteItemAsync("pigeon:token");
}
export const getToken = () => token;

export type Flight = {
  id: number;
  pigeon: string;
  direction: "in" | "out";
  peer: string;
  sent_at: number;
  dist_km: number;
  dur_sec: number;
  progress: number;
  arrived: boolean;
  eta_at: number;
  read_at: number | null;
  body: string | null;
  from: { lat: number; lon: number; name: string };
  to: { lat: number; lon: number; name: string };
};

export type Mail = { flying_in: Flight[]; flying_out: Flight[]; delivered: Flight[] };

export async function api<T>(method: string, path: string, body?: object): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof j.detail === "string" ? j.detail : "something broke");
  return j;
}

export function fmtDur(sec: number) {
  if (sec < 3600) return `${Math.max(1, Math.round(sec / 60))}m`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)}h`;
  return `${(sec / 86400).toFixed(1)}d`;
}
export function fmtLeft(f: Flight) {
  return fmtDur(Math.max(0, f.eta_at - Date.now() / 1000));
}
