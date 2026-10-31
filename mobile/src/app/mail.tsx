import React, { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl } from "react-native";
import { router, useFocusEffect } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { api, Mail, Flight, fmtLeft, setToken } from "../lib/api";
import { BIRD_PATH } from "../lib/map";

function Row({ f, onPress }: { f: Flight; onPress: () => void }) {
  const unread = f.direction === "in" && f.arrived && !f.read_at;
  const flying = !f.arrived;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#111" })}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Svg width={34} height={24} viewBox="-20 -12 40 24">
          <Path d={BIRD_PATH} stroke={flying ? "#7a7a7a" : unread ? "#ededed" : "#4a4a4a"} strokeWidth={2.4} strokeLinecap="round" fill="none" />
        </Svg>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {unread && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#ededed" }} />}
            <Text style={{ color: "#ededed", fontSize: 15 }}>{f.pigeon}</Text>
            <Text style={{ color: "#4a4a4a", fontSize: 12 }}>
              · {f.direction === "in" ? `${f.peer} → you` : `you → ${f.peer}`}
            </Text>
          </View>
          <Text style={{ color: "#8a8a8a", fontSize: 12, fontWeight: "300", marginTop: 3 }}>
            {flying
              ? `${Math.round(f.dist_km * f.progress)} of ${Math.round(f.dist_km)} km · lands in ${fmtLeft(f)}`
              : `${(f.body || "").split("\n")[0].slice(0, 60)} · landed ${new Date(f.eta_at * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
          </Text>
          {flying && (
            <View style={{ height: 2, backgroundColor: "#161616", borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
              <View style={{ height: 2, width: `${Math.round(f.progress * 100)}%`, backgroundColor: "#cfcfcf" }} />
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

export default function MailBox() {
  const [mail, setMail] = useState<Mail>({ flying_in: [], flying_out: [], delivered: [] });
  const [who, setWho] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [m, me] = await Promise.all([api<Mail>("GET", "/api/mail"), api<any>("GET", "/api/me")]);
      setMail(m);
      setWho(me.username);
    } catch {
      setToken(null);
      router.replace("/");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      const t = setInterval(refresh, 8000);
      return () => clearInterval(t);
    }, [refresh])
  );

  const flying = [...mail.flying_in, ...mail.flying_out];
  const empty = !flying.length && !mail.delivered.length;

  return (
    <View style={{ flex: 1, backgroundColor: "#000", paddingTop: 56 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#1c1c1c" }}>
        <Text style={{ color: "#ededed", fontWeight: "300", letterSpacing: 0.5 }}>pigeon</Text>
        <Text style={{ color: "#8a8a8a", fontSize: 13, fontWeight: "300" }}>{who}</Text>
        <Pressable onPress={() => router.push("/compose")} style={{ backgroundColor: "#ededed", borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8 }}>
          <Text style={{ color: "#000", fontSize: 13, fontWeight: "500" }}>write</Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refresh(); setRefreshing(false); }} tintColor="#8a8a8a" />}
      >
        {empty && <Text style={{ color: "#3a3a3a", textAlign: "center", fontWeight: "300", fontSize: 14, marginTop: 300 }}>the sky is quiet.</Text>}
        {flying.length > 0 && (
          <Text style={{ color: "#3a3a3a", fontSize: 11, letterSpacing: 1.8, textTransform: "uppercase", marginTop: 22, marginBottom: 4 }}>in the air</Text>
        )}
        {flying.map((f) => (
          <Row key={f.id} f={f} onPress={() => router.push(`/flight?id=${f.id}`)} />
        ))}
        {mail.delivered.length > 0 && (
          <Text style={{ color: "#3a3a3a", fontSize: 11, letterSpacing: 1.8, textTransform: "uppercase", marginTop: 22, marginBottom: 4 }}>landed</Text>
        )}
        {mail.delivered.map((f) => (
          <Row key={f.id} f={f} onPress={() => router.push(`/letter?id=${f.id}`)} />
        ))}
        <Pressable
          onPress={async () => {
            await setToken(null);
            router.replace("/");
          }}
          style={{ alignSelf: "center", marginTop: 40 }}
        >
          <Text style={{ color: "#8a8a8a", fontSize: 14 }}>leave the coop</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
