import React, { useState } from "react";
import { View, Text, Pressable, TextInput, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Host, TextField, Button, useNativeState } from "@expo/ui/swift-ui";
import { buttonStyle, controlSize, textFieldStyle } from "@expo/ui/swift-ui/modifiers";
import { api, fmtDur } from "../lib/api";

export default function Compose() {
  const { to: toParam } = useLocalSearchParams<{ to?: string }>();
  const to = useNativeState(typeof toParam === "string" ? toParam : "");
  const [body, setBody] = useState("");
  const [info, setInfo] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const onToChange = async (u: string) => {
    const v = u.trim();
    if (v.length < 3) return setInfo("");
    try {
      const r = await api<any>("GET", `/api/users/${encodeURIComponent(v)}`);
      setInfo(`${Math.round(r.dist_km)} km by air · lands in ~${fmtDur(r.dur_sec)}`);
    } catch {
      setInfo("no coop by that name");
    }
  };

  const send = async () => {
    setErr("");
    setBusy(true);
    try {
      const f = await api<any>("POST", "/api/letters", { to: to.get().trim(), body });
      router.replace(`/flight?id=${f.id}`);
    } catch (e: any) {
      setErr(e?.message || "failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: "#000", paddingTop: 56 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#1c1c1c" }}>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: "#8a8a8a", fontSize: 20 }}>←</Text>
        </Pressable>
        <Text style={{ color: "#8a8a8a", fontSize: 15, fontWeight: "300" }}>new letter</Text>
        <View style={{ width: 20 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Host colorScheme="dark">
          <TextField text={to} placeholder="to (coop name)" onTextChange={onToChange} modifiers={[textFieldStyle("roundedBorder")]} />
        </Host>
        <Text style={{ color: "#8a8a8a", fontSize: 12, minHeight: 16, fontWeight: "300" }}>{info}</Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="dear…"
          placeholderTextColor="#4a4a4a"
          multiline
          style={{
            backgroundColor: "#0a0a0a",
            borderWidth: 1,
            borderColor: "#1c1c1c",
            borderRadius: 14,
            color: "#ededed",
            fontSize: 16,
            padding: 16,
            minHeight: 160,
            textAlignVertical: "top",
          }}
        />
        <Text style={{ color: "#b05c5c", fontSize: 13, minHeight: 16, fontWeight: "300" }}>{err}</Text>
        <Host colorScheme="dark">
          <Button label="release the pigeon" onPress={send} modifiers={[buttonStyle("borderedProminent"), controlSize("large")]} />
        </Host>
        {busy && <Text style={{ color: "#3a3a3a", fontSize: 12, textAlign: "center" }}>flying…</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
