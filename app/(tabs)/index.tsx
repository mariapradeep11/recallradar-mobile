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
import { RecallCard } from "../../src/components/RecallCard";
import { colors, radius, spacing, type } from "../../src/theme";
import {
  CATEGORY_LABELS,
  type Category,
  type Recall,
  searchRecalls,
} from "../../src/lib/api";

const CATEGORIES: Category[] = ["food", "drug", "device", "consumer"];
const EXAMPLES = ["chicken", "ibuprofen", "Tylenol", "peanut butter", "baby formula"];

function PulseRing() {
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
      <Animated.View style={[styles.pulseRing, { transform: [{ scale }], opacity }]} />
      <View style={styles.pulseDot} />
    </View>
  );
}

function LoadingDots() {
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
        <Animated.View
          key={i}
          style={[styles.dot, { transform: [{ translateY: dot }] }]}
        />
      ))}
    </View>
  );
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("food");
  const [results, setResults] = useState<Recall[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<TextInput>(null);

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
      {/* Logo header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.logoRow}>
          <PulseRing />
          <View>
            <Text style={styles.wordmark}>
              RECALL<Text style={{ color: colors.accent }}>RADAR</Text>
            </Text>
            <Text style={styles.tagline}>FDA intelligence · updated in real time</Text>
          </View>
        </View>

        {/* Search bar */}
        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>⊙</Text>
          <TextInput
            ref={inputRef}
            style={styles.input}
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
              <Text style={styles.clearBtn}>✕</Text>
            </Pressable>
          )}
        </View>
        <Pressable
          style={({ pressed }) => [styles.searchBtn, pressed && { opacity: 0.82 }]}
          onPress={() => run()}
        >
          <Text style={styles.searchBtnText}>Search FDA Database</Text>
        </Pressable>

        {/* Category pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll} contentContainerStyle={styles.pillsRow}>
          {CATEGORIES.map((c) => (
            <Pressable
              key={c}
              onPress={() => { setCategory(c); setResults([]); setSearched(false); }}
              style={[styles.pill, category === c && styles.pillActive]}
            >
              <Text style={[styles.pillText, category === c && styles.pillTextActive]}>
                {CATEGORY_LABELS[c]}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Results header */}
      {!loading && results.length > 0 && (
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsLabel}>
            {results.length} recall{results.length !== 1 ? "s" : ""} found
          </Text>
          <View style={[styles.liveTag, { backgroundColor: "rgba(52,199,89,0.12)" }]}>
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
          <LoadingDots />
          <Text style={styles.loadingText}>Checking FDA database…</Text>
          <Text style={styles.loadingSubtext}>food · drug · device enforcement</Text>
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.centerState}>
          <Text style={styles.errorIcon}>⚠</Text>
          <Text style={[styles.stateHeading, { color: colors.alert }]}>Connection error</Text>
          <Text style={styles.stateText}>{error}</Text>
        </View>
      );
    }
    if (searched && results.length === 0) {
      return (
        <View style={styles.centerState}>
          <Text style={styles.emptyIcon}>○</Text>
          <Text style={styles.stateHeading}>No FDA records found</Text>
          <Text style={styles.stateText}>
            {category === "consumer"
              ? "Consumer products aren't in FDA — check CPSC.gov directly."
              : "No recorded recall for this product, or try a broader search term."}
          </Text>
        </View>
      );
    }
    // Idle state
    return (
      <View style={styles.idleState}>
        <Text style={styles.idleTitle}>Search any product</Text>
        <Text style={styles.idleBody}>
          Live FDA recall data across food, medicine, and medical devices.
        </Text>

        <View style={styles.divider} />
        <Text style={styles.examplesLabel}>Try these</Text>
        <View style={styles.exampleGrid}>
          {EXAMPLES.map((ex) => (
            <Pressable
              key={ex}
              onPress={() => { setQuery(ex); run(ex); }}
              style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.chipText}>{ex}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.divider} />
        <View style={styles.statsRow}>
          {[
            { n: "FDA", label: "data source" },
            { n: "3", label: "categories" },
            { n: "live", label: "enforcement feed" },
          ].map(({ n, label }) => (
            <View key={label} style={styles.statBox}>
              <Text style={styles.statNum}>{n}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <FlatList
        data={results}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item, index }) => <AnimatedCard item={item} index={index} />}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

function AnimatedCard({ item, index }: { item: Recall; index: number }) {
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
      <RecallCard recall={item} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  list: { flexGrow: 1 },

  header: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  wordmark: {
    fontSize: 17,
    fontWeight: "200",
    letterSpacing: 4,
    color: colors.text,
  },
  tagline: {
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 0.3,
    marginTop: 2,
  },

  // pulse
  pulseContainer: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  pulseRing: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },

  // search
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  searchIcon: { fontSize: 16, color: colors.textMuted, marginRight: spacing.sm },
  input: { flex: 1, paddingVertical: 13, color: colors.text, fontSize: 15 },
  clearBtn: { fontSize: 13, color: colors.textMuted, padding: 4 },
  searchBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: "center",
    marginBottom: spacing.md,
  },
  searchBtnText: { color: "#fbf1ec", fontWeight: "700", fontSize: 14, letterSpacing: 0.3 },

  // pills
  pillsScroll: { marginBottom: 0 },
  pillsRow: { gap: spacing.sm, paddingRight: spacing.xl },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillText: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  pillTextActive: { color: "#fbf1ec" },

  // results header
  resultsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  resultsLabel: { ...type.label, color: colors.textSoft },
  liveTag: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    gap: 4,
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#34c759" },
  liveText: { fontSize: 9, fontWeight: "700", letterSpacing: 0.8, color: "#34c759" },

  // list
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xxl,
    paddingTop: 48,
    gap: spacing.md,
  },
  loadingText: { ...type.body, color: colors.textSoft, marginTop: spacing.sm },
  loadingSubtext: { ...type.label, marginTop: -spacing.sm },
  errorIcon: { fontSize: 28, color: colors.alert },
  emptyIcon: { fontSize: 32, color: colors.textMuted },
  stateHeading: { ...type.h2, textAlign: "center" },
  stateText: { ...type.body, textAlign: "center", maxWidth: 280 },

  // idle
  idleState: { padding: spacing.xl, paddingTop: spacing.xxl },
  idleTitle: { ...type.h1, marginBottom: spacing.sm },
  idleBody: { ...type.body, maxWidth: 300, marginBottom: spacing.xl },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xl },
  examplesLabel: { ...type.label, marginBottom: spacing.md },
  exampleGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
  },
  chipText: { fontSize: 13, color: colors.textSoft, fontWeight: "500" },
  statsRow: { flexDirection: "row", justifyContent: "space-around" },
  statBox: { alignItems: "center", gap: 4 },
  statNum: { fontSize: 18, fontWeight: "700", color: colors.accent },
  statLabel: { ...type.label },

  // dots loader
  dotsRow: { flexDirection: "row", gap: 8, marginBottom: spacing.sm },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
});
