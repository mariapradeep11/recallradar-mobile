import React, { useRef, useState } from "react";
import { ActivityIndicator, Animated, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "../context/ThemeContext";
import { radius, spacing } from "../theme";
import { formatDate, getGuidance, getSeverity, type Recall } from "../lib/api";
import { fetchNewsIntel, type Article, type NewsSnapshot } from "../lib/newsIntel";

type IntelState = "idle" | "loading" | "loaded" | "error";

export function RecallCard({ recall, isPremium }: { recall: Recall; isPremium: boolean }) {
  const { colors } = useTheme();
  const [expanded,   setExpanded]   = useState(false);
  const [intelState, setIntelState] = useState<IntelState>("idle");
  const [newsData,   setNewsData]   = useState<NewsSnapshot | null>(null);
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const severity = getSeverity(recall.reason_for_recall);
  const guidance = getGuidance(recall.reason_for_recall);

  const SEVERITY = {
    HIGH:   { bar: colors.alert,       badge: "rgba(255,59,48,0.12)",  text: colors.alert,       label: "HIGH RISK" },
    MEDIUM: { bar: colors.caution,     badge: "rgba(217,164,65,0.12)", text: colors.caution,     label: "MEDIUM RISK" },
    LOW:    { bar: colors.borderStrong, badge: colors.surface,          text: colors.textMuted,   label: "LOW RISK" },
  };
  const s = SEVERITY[severity];

  const toggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(rotateAnim, {
      toValue: expanded ? 0 : 1, duration: 200, useNativeDriver: true,
    }).start();
    setExpanded(v => !v);
  };

  const chevronRotate = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });

  const handleIntelRequest = async () => {
    if (intelState === "loading" || intelState === "loaded") return;
    if (!recall.recall_number) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIntelState("loading");

    const query = [recall.recalling_firm, recall.product_description]
      .filter(Boolean).join(" ").slice(0, 120);

    const data = await fetchNewsIntel(recall.recall_number, query);

    if (!data) {
      setIntelState("error");
      return;
    }
    setNewsData(data);
    setIntelState("loaded");
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: s.bar }]}>

      {/* Severity + classification */}
      <View style={styles.topRow}>
        <View style={[styles.badge, { backgroundColor: s.badge }]}>
          <Text style={[styles.badgeText, { color: s.text }]}>{s.label}</Text>
        </View>
        {recall.classification ? (
          <Text style={[styles.classText, { color: colors.textMuted }]}>{recall.classification}</Text>
        ) : null}
      </View>

      {/* Product name */}
      <Text style={[styles.product, { color: colors.text }]} numberOfLines={3}>
        {recall.product_description || "Unknown product"}
      </Text>

      {/* Reason */}
      <View style={styles.reasonBlock}>
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Reason for recall</Text>
        <Text style={[styles.reasonText, { color: colors.textSoft }]} numberOfLines={expanded ? undefined : 2}>
          {recall.reason_for_recall || "No reason provided"}
        </Text>
      </View>

      {/* Meta row */}
      <View style={[styles.metaRow, { borderTopColor: colors.border }]}>
        <MetaItem label="Company" value={recall.recalling_firm || "—"} colors={colors} />
        <View style={[styles.metaDivider, { backgroundColor: colors.border }]} />
        <MetaItem label="Date" value={formatDate(recall.report_date)} colors={colors} />
        {recall.recall_number ? (
          <>
            <View style={[styles.metaDivider, { backgroundColor: colors.border }]} />
            <MetaItem label="Recall #" value={recall.recall_number} mono colors={colors} />
          </>
        ) : null}
      </View>

      {/* What to do — expandable */}
      <Pressable onPress={toggle} style={styles.expandRow} hitSlop={8}>
        <Text style={[styles.expandLabel, { color: s.text }]}>What should I do?</Text>
        <Animated.Text style={[styles.chevron, { color: colors.textMuted, transform: [{ rotate: chevronRotate }] }]}>
          ↓
        </Animated.Text>
      </Pressable>

      {expanded && (
        <View style={[styles.guidanceBlock, { borderTopColor: colors.border }]}>
          {guidance.map((action, i) => (
            <View key={i} style={styles.guidanceLine}>
              <View style={[styles.guidancePip, { backgroundColor: s.bar }]} />
              <Text style={[styles.guidanceText, { color: colors.textSoft }]}>{action}</Text>
            </View>
          ))}
          <View style={[styles.sourceRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.sourceText, { color: colors.textMuted }]}>Source: FDA Enforcement Database</Text>
          </View>
        </View>
      )}

      {/* ── News Intel section ──────────────────────────────────────────────── */}
      {recall.recall_number ? (
        <View style={[styles.intelOuter, { borderTopColor: colors.border }]}>

          {/* Section header — always visible, tap to load */}
          <Pressable
            onPress={handleIntelRequest}
            style={styles.intelHeader}
            hitSlop={8}
            disabled={intelState === "loading" || intelState === "loaded"}
          >
            <View style={styles.intelTitleRow}>
              <View style={[styles.intelBadge, { backgroundColor: "rgba(217,164,65,0.14)" }]}>
                <Text style={[styles.intelBadgeText, { color: "#d9a441" }]}>INTEL</Text>
              </View>
              <Text style={[styles.intelTitle, { color: colors.textSoft }]}>News Coverage</Text>
            </View>

            {intelState === "idle" && (
              <Text style={[styles.intelCta, { color: "#d9a441" }]}>
                {isPremium ? "Load →" : "Preview →"}
              </Text>
            )}
            {intelState === "loading" && <ActivityIndicator size="small" color="#d9a441" />}
            {intelState === "loaded" && newsData && (
              <Text style={[styles.intelCount, { color: colors.textMuted }]}>
                {newsData.articleCount} {newsData.articleCount === 1 ? "story" : "stories"}
              </Text>
            )}
            {intelState === "error" && (
              <Text style={[styles.intelCount, { color: colors.textMuted }]}>Unavailable</Text>
            )}
          </Pressable>

          {/* Loaded state */}
          {intelState === "loaded" && newsData && (
            <>
              {/* Claude summary */}
              {newsData.summary ? (
                <View style={[styles.summaryBox, { backgroundColor: "rgba(217,164,65,0.07)", borderColor: "rgba(217,164,65,0.2)" }]}>
                  <Text style={[styles.summaryText, { color: colors.textSoft }]}>{newsData.summary}</Text>
                </View>
              ) : null}

              {/* Article list (premium) or upgrade teaser (free) */}
              {newsData.teaser ? (
                <PremiumTeaser count={newsData.articleCount} colors={colors} />
              ) : (
                newsData.articles.map((article, i) => (
                  <ArticleRow key={i} article={article} colors={colors} />
                ))
              )}
            </>
          )}
        </View>
      ) : null}

    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetaItem({ label, value, mono, colors }: { label: string; value: string; mono?: boolean; colors: any }) {
  return (
    <View style={styles.metaItem}>
      <Text style={[styles.metaLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.metaValue, { color: colors.textSoft }, mono && styles.metaMono]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function ArticleRow({ article, colors }: { article: Article; colors: any }) {
  const handlePress = () => {
    if (article.link) Linking.openURL(article.link).catch(() => {});
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.articleRow, { borderTopColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.articleTitle, { color: colors.text }]} numberOfLines={2}>
          {article.title}
        </Text>
        <View style={styles.articleMeta}>
          {article.source ? (
            <Text style={[styles.articleSource, { color: "#d9a441" }]}>{article.source}</Text>
          ) : null}
          {article.pubDate ? (
            <Text style={[styles.articleDate, { color: colors.textMuted }]}>
              {formatArticleDate(article.pubDate)}
            </Text>
          ) : null}
        </View>
        {article.snippet ? (
          <Text style={[styles.articleSnippet, { color: colors.textMuted }]} numberOfLines={2}>
            {article.snippet}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.articleChevron, { color: colors.textMuted }]}>↗</Text>
    </Pressable>
  );
}

function PremiumTeaser({ count, colors }: { count: number; colors: any }) {
  return (
    <View style={[styles.teaserBox, { backgroundColor: "rgba(217,164,65,0.06)", borderColor: "rgba(217,164,65,0.18)" }]}>
      <Text style={[styles.teaserCount, { color: "#d9a441" }]}>
        {count} news {count === 1 ? "story" : "stories"} found
      </Text>
      <Text style={[styles.teaserBody, { color: colors.textSoft }]}>
        Full coverage and AI summary available with RecallRadar Premium.
      </Text>
      <View style={[styles.teaserBtn, { backgroundColor: "#d9a441" }]}>
        <Text style={styles.teaserBtnText}>Unlock Intel — $4.99 / mo</Text>
      </View>
    </View>
  );
}

function formatArticleDate(raw: string): string {
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return raw;
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderWidth: 1, borderLeftWidth: 3, borderRadius: radius.lg,
    padding: spacing.lg, marginBottom: spacing.md, marginHorizontal: spacing.xl,
  },
  topRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  badge:     { paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill },
  badgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  classText: { fontSize: 10, fontWeight: "600" },
  product:   { fontSize: 15, fontWeight: "700", lineHeight: 21, letterSpacing: -0.2, marginBottom: spacing.md },
  reasonBlock:  { marginBottom: spacing.md },
  sectionLabel: { fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: "600", marginBottom: 4 },
  reasonText:   { fontSize: 13, lineHeight: 18 },
  metaRow:    { flexDirection: "row", paddingVertical: spacing.sm, borderTopWidth: 1, marginBottom: spacing.sm },
  metaItem:   { flex: 1 },
  metaLabel:  { fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: "600", marginBottom: 3 },
  metaValue:  { fontSize: 11, fontWeight: "600" },
  metaMono:   { fontVariant: ["tabular-nums"] },
  metaDivider: { width: 1, marginHorizontal: spacing.md },
  expandRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.sm },
  expandLabel:  { fontSize: 12, fontWeight: "700", letterSpacing: 0.2 },
  chevron:      { fontSize: 14 },
  guidanceBlock:  { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, gap: spacing.sm },
  guidanceLine:   { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  guidancePip:    { width: 5, height: 5, borderRadius: 3, marginTop: 6, flexShrink: 0 },
  guidanceText:   { fontSize: 13, lineHeight: 19, flex: 1 },
  sourceRow:      { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1 },
  sourceText:     { fontSize: 10, letterSpacing: 0.3 },

  // Intel section
  intelOuter:    { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1 },
  intelHeader:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm },
  intelTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  intelBadge:    { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4 },
  intelBadgeText:{ fontSize: 8, fontWeight: "800", letterSpacing: 0.8 },
  intelTitle:    { fontSize: 12, fontWeight: "600" },
  intelCta:      { fontSize: 12, fontWeight: "700" },
  intelCount:    { fontSize: 11, fontWeight: "600" },

  // Claude summary
  summaryBox:  { padding: spacing.md, borderRadius: 8, borderWidth: 1, marginBottom: spacing.sm },
  summaryText: { fontSize: 13, lineHeight: 19, fontStyle: "italic" },

  // Article rows
  articleRow:     { flexDirection: "row", alignItems: "flex-start", paddingVertical: spacing.sm, borderTopWidth: 1, gap: spacing.sm },
  articleTitle:   { fontSize: 13, fontWeight: "600", lineHeight: 18, marginBottom: 4 },
  articleMeta:    { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: 4 },
  articleSource:  { fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
  articleDate:    { fontSize: 10 },
  articleSnippet: { fontSize: 11, lineHeight: 16 },
  articleChevron: { fontSize: 12, marginTop: 2 },

  // Premium teaser
  teaserBox:     { padding: spacing.lg, borderRadius: 8, borderWidth: 1, gap: spacing.sm, alignItems: "flex-start" },
  teaserCount:   { fontSize: 13, fontWeight: "700" },
  teaserBody:    { fontSize: 12, lineHeight: 17 },
  teaserBtn:     { marginTop: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill },
  teaserBtnText: { fontSize: 12, fontWeight: "700", color: "#1a1200" },
});
