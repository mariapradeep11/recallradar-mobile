import React, { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "../src/theme";
import { Onboarding } from "../src/components/Onboarding";

export default function RootLayout() {
  const [checked, setChecked] = useState(false);
  const [onboarded, setOnboarded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("@rr:onboarded").then((val) => {
      setOnboarded(!!val);
      setChecked(true);
    });
  }, []);

  // Hold until we know onboarding state — prevents tab flash
  if (!checked) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {!onboarded ? (
        <Onboarding onComplete={() => setOnboarded(true)} />
      ) : (
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: "fade",
          }}
        >
          <Stack.Screen name="(tabs)" />
        </Stack>
      )}
    </SafeAreaProvider>
  );
}
