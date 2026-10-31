import React, { useEffect, useState } from "react";
import { View, Text, Pressable, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Path } from "react-native-svg";
import { api, Flight, Mail, fmtLeft } from "../lib/api";
import { WorldMap, routePoints, slerp, project, Bird, Coop, MAP_W, MAP_H } from "../lib/map";

export default function FlightScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [f, setF] = useState<Flight | null>(null);
  const [now, setNow] = useState(0);
  const { width } = useWindowDimensions();
  const mapH = width * (MAP_H / MAP_W);

  useEffect(() => {
    let dead = false;
    const tick = async () => {
      try {
        const m = await api<Mail>("GET", "/api/mail");
        if (dead) return;
        const all = [...m.flying_in, ...m.flying_out];
        const found = all.find((x) => x.id === Number(id));
        if (found) {
          setF(found);
          setNow(Date.now() / 1000);
        }
        else router.replace("/mail");
      } catch {
        if (!dead) router.replace("/");
      }
    };
    tick();
    const t = setInterval(tick, 6000);
    const tickT = setInterval(() => setNow(Date.now() / 1000), 4000);
    return () => {
      dead = true;
      clearInterval(t);
      clearInterval(tickT);
    };
  }, [id]);

  if (!f) return <View style={{ flex: 1, backgroundColor: "#000" }} />;

  const t = Math.min(1, Math.max(0, (now - f.sent_at) / f.dur_sec));
  const route = routePoints(f.from, f.to);
  const full = route.map(([la, lo], i) => `${i ? "L" : "M"}${project(lo, la, MAP_W, MAP_H).map((v) => v.toFixed(1)).join(" ")}`).join(" ");
  const n = Math.max(2, Math.floor(t * route.length));
  const flown = route
    .slice(0, n)
    .map(([la, lo], i) => `${i ? "L" : "M"}${project(lo, la, MAP_W, MAP_H).map((v) => v.toFixed(1)).join(" ")}`)
    .join(" ");
  const [plat, plon] = slerp(f.from.lat, f.from.lon, f.to.lat, f.to.lon, t);
  const [px, py] = project(plon, plat, MAP_W, MAP_H);
  const [fx, fy] = project(f.from.lon, f.from.lat, MAP_W, MAP_H);
  const [tx, ty] = project(f.to.lon, f.to.lat, MAP_W, MAP_H);

  return (
    <View style={{ flex: 1, backgroundColor: "#000", paddingTop: 56 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#1c1c1c" }}>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: "#8a8a8a", fontSize: 20 }}>←</Text>
        </Pressable>
        <Text style={{ color: "#8a8a8a", fontSize: 15, fontWeight: "300" }}>
          {f.pigeon} · {f.direction === "in" ? `${f.peer} → you` : `you → ${f.peer}`}
        </Text>
        <View style={{ width: 20 }} />
      </View>
      <View style={{ flex: 1, justifyContent: "center" }}>
        <WorldMap width={width} height={mapH} dotColor="#1e1e1e">
          <Path d={full} stroke="#2b2b2b" strokeWidth={1.1} strokeDasharray="2 6" fill="none" />
          <Path d={flown} stroke="#d0d0d0" strokeWidth={1.6} fill="none" />
          <Coop x={fx} y={fy} label={f.direction === "out" ? "you" : f.from.name} />
          <Coop x={tx} y={ty} label={f.direction === "in" ? "you" : f.to.name} />
          <Bird x={px} y={py} scale={0.9} />
        </WorldMap>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: "#1c1c1c" }}>
        {[
          ["flown", `${Math.round(f.dist_km * t)} km`],
          ["left", `${Math.round(f.dist_km * (1 - t))} km`],
          ["progress", `${Math.round(t * 100)}%`],
          ["lands", fmtLeft(f)],
        ].map(([k, v]) => (
          <View key={k}>
            <Text style={{ color: "#3a3a3a", fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase" }}>{k}</Text>
            <Text style={{ color: "#ededed", fontSize: 15, marginTop: 4, fontWeight: "300" }}>{v}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
