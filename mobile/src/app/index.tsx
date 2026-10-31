import React, { useState } from "react";
import { View, Text, Pressable, Dimensions, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { router } from "expo-router";
import { Host, TextField, SecureField, Button, useNativeState } from "@expo/ui/swift-ui";
import { buttonStyle, controlSize, textFieldStyle, submitLabel } from "@expo/ui/swift-ui/modifiers";
import { api, setToken, loadToken } from "../lib/api";
import { WorldMap, Coop, project } from "../lib/map";

const MAP_BOX_W = Math.min(Dimensions.get("window").width - 64, 340);
const MAP_BOX_H = MAP_BOX_W * (170 / 360);

export default function Auth() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [coop, setCoop] = useState<{ lat: number; lon: number } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const username = useNativeState("");
  const password = useNativeState("");

  React.useEffect(() => {
    loadToken().then(async (t) => {
      if (!t) return;
      try {
        await api("GET", "/api/me");
        router.replace("/mail");
      } catch {
        setToken(null);
      }
    });
  }, []);

  const go = async () => {
    setErr("");
    setBusy(true);
    try {
      const u = username.get().trim();
      const p = password.get();
      const r =
        mode === "register"
          ? coop
            ? await api<any>("POST", "/api/auth/register", { username: u, password: p, lat: coop.lat, lon: coop.lon })
            : Promise.reject(new Error("place your coop on the map first"))
          : await api<any>("POST", "/api/auth/login", { username: u, password: p });
      await setToken(r.token);
      router.replace("/mail");
    } catch (e: any) {
      setErr(e?.message || "nope");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: "#000" }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ width: "100%", maxWidth: 400 }}>
          <Text style={{ color: "#ededed", fontSize: 44, fontWeight: "200", letterSpacing: 0.5 }}>pigeon</Text>
          <Text style={{ color: "#8a8a8a", marginTop: 4, marginBottom: 28, fontSize: 14, fontWeight: "300" }}>
            mail at bird speed.
          </Text>

          <View
            style={{
              flexDirection: "row",
              backgroundColor: "#0a0a0a",
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "#1c1c1c",
              padding: 4,
              marginBottom: 16,
            }}
          >
            {(["login", "register"] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                style={{
                  flex: 1,
                  paddingVertical: 9,
                  borderRadius: 999,
                  backgroundColor: mode === m ? "#1a1a1a" : "transparent",
                }}
              >
                <Text style={{ textAlign: "center", color: mode === m ? "#ededed" : "#8a8a8a", fontSize: 13 }}>
                  {m === "login" ? "return" : "new coop"}
                </Text>
              </Pressable>
            ))}
          </View>

          <Host colorScheme="dark" style={{ gap: 10 }}>
            <TextField text={username} placeholder="name" modifiers={[textFieldStyle("roundedBorder"), submitLabel("next")]} />
            <SecureField text={password} placeholder="word" modifiers={[textFieldStyle("roundedBorder"), submitLabel("go")]} />
          </Host>

          {mode === "register" && (
            <View style={{ marginTop: 12 }}>
              <Text style={{ color: "#8a8a8a", fontSize: 12, fontWeight: "300", marginBottom: 8 }}>
                tap the map to place your coop
              </Text>
              <View style={{ borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "#1c1c1c" }}>
                <WorldMap width={MAP_BOX_W} height={MAP_BOX_H} dotColor="#242424" onTap={(lon, lat) => setCoop({ lon, lat })}>
                  {coop && <Coop x={project(coop.lon, coop.lat, 792, 374)[0]} y={project(coop.lon, coop.lat, 792, 374)[1]} label="your coop" />}
                </WorldMap>
              </View>
            </View>
          )}

          <Text style={{ color: "#b05c5c", fontSize: 13, minHeight: 16, marginTop: 8, fontWeight: "300" }}>{err}</Text>

          <Host colorScheme="dark" style={{ marginTop: 4 }}>
            <Button
              label={mode === "login" ? "fly in" : "build coop"}
              onPress={go}
              modifiers={[buttonStyle("borderedProminent"), controlSize("large")]}
            />
          </Host>
          {busy && <Text style={{ color: "#3a3a3a", fontSize: 12, marginTop: 8, textAlign: "center" }}>flying…</Text>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
