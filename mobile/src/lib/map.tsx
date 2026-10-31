import React, { useMemo } from "react";
import { GestureResponderEvent } from "react-native";
import Svg, { Circle, G, Path, Text as SvgText } from "react-native-svg";
import { LAND } from "../land";

const LAT_MIN = -85;
const LAT_MAX = 85;
const D2R = Math.PI / 180;

export const project = (lon: number, lat: number, w: number, h: number): [number, number] => [
  ((lon + 180) / 360) * w,
  ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * h,
];
export const unproject = (x: number, y: number, w: number, h: number): [number, number] => [
  (x / w) * 360 - 180,
  LAT_MAX - (y / h) * (LAT_MAX - LAT_MIN),
];

export function slerp(lat1: number, lon1: number, lat2: number, lon2: number, t: number): [number, number] {
  const p1 = lat1 * D2R;
  const p2 = lat2 * D2R;
  const l1 = lon1 * D2R;
  const l2 = lon2 * D2R;
  const ax = Math.cos(p1) * Math.cos(l1),
    ay = Math.cos(p1) * Math.sin(l1),
    az = Math.sin(p1);
  const bx = Math.cos(p2) * Math.cos(l2),
    by = Math.cos(p2) * Math.sin(l2),
    bz = Math.sin(p2);
  const dot = Math.max(-1, Math.min(1, ax * bx + ay * by + az * bz));
  const w = Math.acos(dot);
  if (w < 1e-6) return [lat1, lon1];
  const so = Math.sin(w);
  const ka = Math.sin((1 - t) * w) / so,
    kb = Math.sin(t * w) / so;
  const x = ka * ax + kb * bx,
    y = ka * ay + kb * by,
    z = ka * az + kb * bz;
  return [Math.asin(z) / D2R, Math.atan2(y, x) / D2R];
}

export function routePoints(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
  n = 160
): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) pts.push(slerp(a.lat, a.lon, b.lat, b.lon, i / n));
  return pts;
}

const DOT_R = 1.15;
const SCALE = 2.2; // world drawn in a 360*SCALE x 170*SCALE space
export const MAP_W = 360 * SCALE;
export const MAP_H = 170 * SCALE;

export function landPath(): string {
  let d = "";
  for (const [lon, lat] of LAND) {
    const [x, y] = project(lon, lat, MAP_W, MAP_H);
    d += `M${(x - DOT_R).toFixed(1)} ${y.toFixed(1)}a${DOT_R} ${DOT_R} 0 1 0 ${DOT_R * 2} 0a${DOT_R} ${DOT_R} 0 1 0 ${-DOT_R * 2} 0`;
  }
  return d;
}

export const BIRD_PATH =
  "M-16 2 Q-9 -8 -1 -1 Q9 -8 16 2";

export function Bird({ x, y, scale = 1, color = "#fff", halo = true }: { x: number; y: number; scale?: number; color?: string; halo?: boolean }) {
  return (
    <G>
      {halo && <Circle cx={x} cy={y} r={13 * scale} fill="#fff" opacity={0.08} />}
      <G x={x} y={y}>
        <Path d={BIRD_PATH} stroke={color} strokeWidth={3.4 * scale} strokeLinecap="round" fill="none" scale={scale} />
      </G>
    </G>
  );
}

export function Coop({ x, y, label }: { x: number; y: number; label?: string }) {
  return (
    <G>
      <Circle cx={x} cy={y} r={6.5} stroke="#cfcfcf" strokeWidth={1.4} fill="none" />
      <Circle cx={x} cy={y} r={2.2} fill="#ededed" />
      {label ? (
        <SvgText x={x} y={y - 13} fill="#8a8a8a" fontSize={11} fontWeight="300" textAnchor="middle">
          {label}
        </SvgText>
      ) : null}
    </G>
  );
}

type MapProps = {
  width: number;
  height: number;
  dotColor?: string;
  onTap?: (lon: number, lat: number) => void;
  children?: React.ReactNode;
};

export function WorldMap({ width, height, dotColor = "#1f1f1f", onTap, children }: MapProps) {
  const d = useMemo(() => landPath(), []);
  const kx = width / MAP_W;
  const ky = height / MAP_H;
  const handle = (e: GestureResponderEvent) => {
    if (!onTap) return;
    const { locationX, locationY } = e.nativeEvent;
    const [lon, lat] = unproject(locationX / kx, locationY / ky, MAP_W, MAP_H);
    onTap(Math.max(-180, Math.min(180, lon)), Math.max(LAT_MIN, Math.min(LAT_MAX, lat)));
  };
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${MAP_W} ${MAP_H}`} onStartShouldSetResponder={() => true} onResponderGrant={handle}>
      <Path d={d} fill={dotColor} />
      {children}
    </Svg>
  );
}
