import React from "react";
import { ScrollView, StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import { spacing } from "../theme";

export function Screen({
  children,
  scroll = true,
  centered = false,
  style,
  contentStyle,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  centered?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
}) {
  const { colors } = useTheme();

  if (scroll) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }, style]}>
        <ScrollView
          contentContainerStyle={[styles.content, centered && styles.centered, contentStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }, style]}>
      <View style={[styles.content, styles.flex, centered && styles.centered, contentStyle]}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: spacing.xl, flexGrow: 1 },
  flex: { flex: 1 },
  centered: { justifyContent: "center", alignItems: "center" },
});
