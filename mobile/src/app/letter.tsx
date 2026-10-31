import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { api, Flight, Mail } from "../lib/api";
import { BIRD_PATH } from "../lib/map";

export default function Letter() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [f, setF] = useState<Flight | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const m = await api<Mail>("GET", "/api/mail");
        const found = m.delivered.find((x) => x.id === Number(id));
        if (!found) return router.replace("/mail");
        setF(found);
        if (!found.read_at) api("POST", `/api/letters/${id}/read`).catch(() => {});
      } catch {
        router.replace("/");
      }
    })();
  }, [id]);

  if (!f) return <View style={{ flex: 1, backgroundColor: "#000" }} />;

  const days = Math.max(0, (f.eta_at - f.sent_at) / 86400);
  const when = new Date(f.eta_at * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <View style={{ flex: 1, backgroundColor: "#000", paddingTop: 56 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#1c1c1c" }}>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: "#8a8a8a", fontSize: 20 }}>←</Text>
        </Pressable>
        <Text style={{ color: "#8a8a8a", fontSize: 15, fontWeight: "300" }}>letter</Text>
        <View style={{ width: 20 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View
          style={{
            backgroundColor: "#0a0a0a",
            borderRadius: 18,
            borderWidth: 1,
            borderColor: "#1c1c1c",
            padding: 26,
            marginTop: 8,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Svg width={26} height={18} viewBox="-20 -12 40 24">
                <Path d={BIRD_PATH} stroke="#8a8a8a" strokeWidth={2.4} strokeLinecap="round" fill="none" />
              </Svg>
              <Text style={{ color: "#ededed", fontSize: 15 }}>{f.direction === "in" ? `${f.peer} → you` : `you → ${f.peer}`}</Text>
            </View>
            <Text style={{ color: "#4a4a4a", fontSize: 12, fontWeight: "300" }}>{f.pigeon}</Text>
          </View>
          <Text style={{ color: "#8a8a8a", fontSize: 12, fontWeight: "300", marginTop: 6 }}>
            carried {Math.round(f.dist_km)} km over {days >= 1 ? `${days.toFixed(1)} days` : `${Math.round((f.eta_at - f.sent_at) / 60)} minutes`} · landed {when}
          </Text>
          <Text style={{ color: "#ededed", fontSize: 17, fontWeight: "300", lineHeight: 27, marginTop: 22 }}>{f.body}</Text>
        </View>
        {f.direction === "in" && (
          <Pressable
            onPress={() => router.push(`/compose?to=${f.peer}`)}
            style={{
              marginTop: 16,
              alignSelf: "flex-start",
              borderWidth: 1,
              borderColor: "#1c1c1c",
              borderRadius: 999,
              paddingHorizontal: 18,
              paddingVertical: 9,
              backgroundColor: "#0a0a0a",
            }}
          >
            <Text style={{ color: "#ededed", fontSize: 13 }}>write back to {f.peer}</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}
