import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { RecallCard } from "../../src/components/RecallCard";
import { useTheme } from "../../src/context/ThemeContext";
import { radius, spacing } from "../../src/theme";
import {
  CATEGORY_LABELS,
  type Category,
  type Recall,
  searchRecalls,
} from "../../src/lib/api";
import { usePremium } from "../../src/hooks/usePremium";

const CATEGORIES: Category[] = ["food", "drug", "device", "consumer"];
const EXAMPLES = ["chicken", "ibuprofen", "Tylenol", "peanut butter", "baby formula"];

function PulseRing({ accent }: { accent: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.6, duration: 1800, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 1800, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.6, duration: 0, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.pulseContainer}>
      <Animated.View style={[styles.pulseRing, { borderColor: accent, transform: [{ scale }], opacity }]} />
      <View style={[styles.pulseDot, { backgroundColor: accent }]} />
    </View>
  );
}

function LoadingDots({ accent }: { accent: string }) {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  useEffect(() => {
    const anims = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 180),
          Animated.timing(dot, { toValue: -6, duration: 280, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 280, useNativeDriver: true }),
          Animated.delay(500),
        ])
      )
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, []);

  return (
    <View style={styles.dotsRow}>
      {dots.map((dot, i) => (
        <Animated.View key={i} style={[styles.dot, { backgroundColor: accent, transform: [{ translateY: dot }] }]} />
      ))}
    </View>
  );
}

export default function SearchScreen() {
  const { colors, type: t } = useTheme();
  const insets = useSafeAreaInsets();
  const { q: scannedQuery } = useLocalSearchParams<{ q?: string }>();
  const { isPremium } = usePremium();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("food");
  const [results, setResults] = useState<Recall[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  // Auto-trigger search when arriving from the barcode scanner
  useEffect(() => {
    if (scannedQuery) {
      setQuery(scannedQuery);
      run(scannedQuery);
    }
  }, [scannedQuery]);

  const run = async (overrideQuery?: string) => {
    const term = overrideQuery ?? query;
    if (!term.trim()) return;
    Keyboard.dismiss();
    setLoading(true);
    setError("");
    setSearched(true);
    setResults([]);
    try {
      const data = await searchRecalls(term, category);
      setResults(data);
    } catch {
      setError("Could not reach the FDA database. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const ListHeader = (
    <View>
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
        <View style={styles.logoRow}>
          <PulseRing accent={colors.accent} />
          <View>
            <Text style={[styles.wordmark, { color: colors.text }]}>
              RECALL<Text style={{ color: colors.accent }}>RADAR</Text>
            </Text>
            <Text style={[styles.tagline, { color: colors.textMuted }]}>FDA intelligence · updated in real time</Text>
          </View>
        </View>

        <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.searchIcon, { color: colors.textMuted }]}>⊙</Text>
          <TextInput
            style={[styles.input, { color: colors.text }]}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => run()}
            placeholder="Search any food, drug, or device…"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            selectionColor={colors.accent}
          />
          {query.length > 0 && (
            <Pressable onPress={() => { setQuery(""); setResults([]); setSearched(false); }}>
              <Text style={[styles.clearBtn, { color: colors.textMuted }]}>✕</Text>
            </Pressable>
          )}
        </View>

        <Pressable
          style={({ pressed }) => [styles.searchBtn, { backgroundColor: colors.accent, opacity: pressed ? 0.82 : 1 }]}
          onPress={() => run()}
        >
          <Text style={styles.searchBtnText}>Search FDA Database</Text>
        </Pressable>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll} contentContainerStyle={styles.pillsRow}>
          {CATEGORIES.map((c) => (
            <Pressable
              key={c}
              onPress={() => { setCategory(c); setResults([]); setSearched(false); }}
              style={[
                styles.pill,
                { borderColor: colors.border },
                category === c && { backgroundColor: colors.accent, borderColor: colors.accent },
              ]}
            >
              <Text style={[styles.pillText, { color: colors.textMuted }, category === c && styles.pillTextActive]}>
                {CATEGORY_LABELS[c]}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {!loading && results.length > 0 && (
        <View style={[styles.resultsHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.resultsLabel, { color: colors.textMuted }]}>
            {results.length} recall{results.length !== 1 ? "s" : ""} found
          </Text>
          <View style={styles.liveTag}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>
      )}
    </View>
  );

  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={styles.centerState}>
          <LoadingDots accent={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textSoft }]}>Checking FDA database…</Text>
          <Text style={[styles.loadingSubtext, { color: colors.textMuted }]}>food · drug · device enforcement</Text>
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.centerState}>
          <Text style={[styles.errorIcon, { color: colors.alert }]}>⚠</Text>
          <Text style={[t.h2, { textAlign: "center", color: colors.alert }]}>Connection error</Text>
          <Text style={[t.body, { textAlign: "center", maxWidth: 280 }]}>{error}</Text>
        </View>
      );
    }
    if (searched && results.length === 0) {
      return (
        <View style={styles.centerState}>
          <Text style={[styles.emptyIcon, { color: colors.textMuted }]}>○</Text>
          <Text style={[t.h2, { textAlign: "center" }]}>No FDA records found</Text>
          <Text style={[t.body, { textAlign: "center", maxWidth: 280 }]}>
            {category === "consumer"
              ? "Consumer products aren't in FDA — check CPSC.gov directly."
              : "No recorded recall for this product, or try a broader search term."}
          </Text>
        </View>
      );
    }
    return (
      <View style={[styles.idleState, { backgroundColor: colors.bg }]}>
        <Text style={t.h1}>Search any product</Text>
        <Text style={[t.body, { maxWidth: 300, marginBottom: spacing.xl }]}>
          Live FDA recall data across food, medicine, and medical devices.
        </Text>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Text style={[styles.examplesLabel, { color: colors.textMuted }]}>Try these</Text>
        <View style={styles.exampleGrid}>
          {EXAMPLES.map((ex) => (
            <Pressable
              key={ex}
              onPress={() => { setQuery(ex); run(ex); }}
              style={({ pressed }) => [styles.chip, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={[styles.chipText, { color: colors.textSoft }]}>{ex}</Text>
            </Pressable>
          ))}
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.statsRow}>
          {[{ n: "FDA", label: "data source" }, { n: "3", label: "categories" }, { n: "live", label: "feed" }].map(({ n, label }) => (
            <View key={label} style={styles.statBox}>
              <Text style={[styles.statNum, { color: colors.accent }]}>{n}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <FlatList
        data={results}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item, index }) => <AnimatedCard item={item} index={index} isPremium={isPremium} />}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

function AnimatedCard({ item, index, isPremium }: { item: Recall; index: number; isPremium: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 320, delay: index * 60, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 320, delay: index * 60, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <RecallCard recall={item} isPremium={isPremium} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { flexGrow: 1 },
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, borderBottomWidth: 1 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.xl },
  wordmark: { fontSize: 17, fontWeight: "200", letterSpacing: 4 },
  tagline: { fontSize: 10, letterSpacing: 0.3, marginTop: 2 },
  pulseContainer: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  pulseRing: { position: "absolute", width: 20, height: 20, borderRadius: 10, borderWidth: 1.5 },
  pulseDot: { width: 7, height: 7, borderRadius: 4 },
  searchWrap: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  searchIcon: { fontSize: 16, marginRight: spacing.sm },
  input: { flex: 1, paddingVertical: 13, fontSize: 15 },
  clearBtn: { fontSize: 13, padding: 4 },
  searchBtn: { borderRadius: radius.md, paddingVertical: 13, alignItems: "center", marginBottom: spacing.md },
  searchBtnText: { color: "#fbf1ec", fontWeight: "700", fontSize: 14, letterSpacing: 0.3 },
  pillsScroll: { marginBottom: 0 },
  pillsRow: { gap: spacing.sm, paddingRight: spacing.xl },
  pill: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1 },
  pillText: { fontSize: 12, fontWeight: "600" },
  pillTextActive: { color: "#fbf1ec" },
  resultsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: 1 },
  resultsLabel: { fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: "600" },
  liveTag: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(52,199,89,0.12)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, gap: 4 },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#34c759" },
  liveText: { fontSize: 9, fontWeight: "700", letterSpacing: 0.8, color: "#34c759" },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xxl, paddingTop: 48, gap: spacing.md },
  loadingText: { marginTop: spacing.sm, fontSize: 14, lineHeight: 20 },
  loadingSubtext: { fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: "600" },
  errorIcon: { fontSize: 28 },
  emptyIcon: { fontSize: 32 },
  idleState: { padding: spacing.xl, paddingTop: spacing.xxl },
  divider: { height: 1, marginVertical: spacing.xl },
  examplesLabel: { fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: "600", marginBottom: spacing.md },
  exampleGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderRadius: radius.pill },
  chipText: { fontSize: 13, fontWeight: "500" },
  statsRow: { flexDirection: "row", justifyContent: "space-around" },
  statBox: { alignItems: "center", gap: 4 },
  statNum: { fontSize: 18, fontWeight: "700" },
  statLabel: { fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: "600" },
  dotsRow: { flexDirection: "row", gap: 8, marginBottom: spacing.sm },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
