import React, { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ThemeProvider, useTheme } from "../src/context/ThemeContext";
import { Onboarding } from "../src/components/Onboarding";
import { supabase } from "../src/lib/supabase";

function AppShell() {
  const { colors, mode } = useTheme();
  const [checked, setChecked] = useState(false);
  const [onboarded, setOnboarded] = useState(false);

  useEffect(() => {
    const init = async () => {
      // Prefer Supabase session (real auth), fall back to local marker
      // so users who completed onboarding before Supabase was added still work.
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setOnboarded(true);
        setChecked(true);
        return;
      }
      const local = await AsyncStorage.getItem("@rr:onboarded");
      setOnboarded(!!local);
      setChecked(true);
    };

    init();

    // Keep auth state in sync across the session lifetime (sign-in, token refresh, sign-out)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setOnboarded(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!checked) return null;

  return (
    <>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
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
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppShell />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
