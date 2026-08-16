import React, { useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "../context/ThemeContext";
import { radius, spacing } from "../theme";
import { formatDate, getGuidance, getSeverity, type Recall } from "../lib/api";

export function RecallCard({ recall }: { recall: Recall }) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const severity = getSeverity(recall.reason_for_recall);
  const guidance = getGuidance(recall.reason_for_recall);

  const SEVERITY = {
    HIGH: { bar: colors.alert, badge: "rgba(255,59,48,0.12)", text: colors.alert, label: "HIGH RISK" },
    MEDIUM: { bar: colors.caution, badge: "rgba(217,164,65,0.12)", text: colors.caution, label: "MEDIUM RISK" },
    LOW: { bar: colors.borderStrong, badge: colors.surface, text: colors.textMuted, label: "LOW RISK" },
  };

  const s = SEVERITY[severity];

  const toggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const toValue = expanded ? 0 : 1;
    Animated.timing(rotateAnim, { toValue, duration: 200, useNativeDriver: true }).start();
    setExpanded((v) => !v);
  };

  const chevronRotate = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: s.bar }]}>
      {/* 1 + 2: What + how serious */}
      <View style={styles.topRow}>
        <View style={[styles.badge, { backgroundColor: s.badge }]}>
          <Text style={[styles.badgeText, { color: s.text }]}>{s.label}</Text>
        </View>
        {recall.classification ? (
          <Text style={[styles.classText, { color: colors.textMuted }]}>{recall.classification}</Text>
        ) : null}
      </View>

      <Text style={[styles.product, { color: colors.text }]} numberOfLines={3}>
        {recall.product_description || "Unknown product"}
      </Text>

      {/* 3: Why */}
      <View style={styles.reasonBlock}>
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Reason for recall</Text>
        <Text style={[styles.reasonText, { color: colors.textSoft }]} numberOfLines={expanded ? undefined : 2}>
          {recall.reason_for_recall || "No reason provided"}
        </Text>
      </View>

      {/* Meta */}
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

      {/* 5: What to do */}
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
    </View>
  );
}

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

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    marginHorizontal: spacing.xl,
  },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill },
  badgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  classText: { fontSize: 10, fontWeight: "600" },
  product: { fontSize: 15, fontWeight: "700", lineHeight: 21, letterSpacing: -0.2, marginBottom: spacing.md },
  reasonBlock: { marginBottom: spacing.md },
  sectionLabel: { fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: "600", marginBottom: 4 },
  reasonText: { fontSize: 13, lineHeight: 18 },
  metaRow: { flexDirection: "row", paddingVertical: spacing.sm, borderTopWidth: 1, marginBottom: spacing.sm },
  metaItem: { flex: 1 },
  metaLabel: { fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: "600", marginBottom: 3 },
  metaValue: { fontSize: 11, fontWeight: "600" },
  metaMono: { fontVariant: ["tabular-nums"] },
  metaDivider: { width: 1, marginHorizontal: spacing.md },
  expandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.sm },
  expandLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 0.2 },
  chevron: { fontSize: 14 },
  guidanceBlock: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, gap: spacing.sm },
  guidanceLine: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  guidancePip: { width: 5, height: 5, borderRadius: 3, marginTop: 6, flexShrink: 0 },
  guidanceText: { fontSize: 13, lineHeight: 19, flex: 1 },
  sourceRow: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1 },
  sourceText: { fontSize: 10, letterSpacing: 0.3 },
});
