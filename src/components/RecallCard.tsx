import React, { useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { colors, radius, spacing, type } from "../theme";
import { formatDate, getGuidance, getSeverity, type Recall } from "../lib/api";

const SEVERITY = {
  HIGH: { bar: colors.alert, badge: "rgba(255,59,48,0.12)", text: colors.alert, label: "HIGH RISK" },
  MEDIUM: { bar: colors.caution, badge: "rgba(217,164,65,0.12)", text: colors.caution, label: "MEDIUM RISK" },
  LOW: { bar: "rgba(247,243,238,0.18)", badge: colors.surface, text: colors.textMuted, label: "LOW RISK" },
};

export function RecallCard({ recall }: { recall: Recall }) {
  const [expanded, setExpanded] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const severity = getSeverity(recall.reason_for_recall);
  const s = SEVERITY[severity];
  const guidance = getGuidance(recall.reason_for_recall);

  const toggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const toValue = expanded ? 0 : 1;
    Animated.timing(rotateAnim, { toValue, duration: 200, useNativeDriver: true }).start();
    setExpanded((v) => !v);
  };

  const chevronRotate = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });

  return (
    <View style={[styles.card, { borderLeftColor: s.bar }]}>
      {/* 1 + 2: What is it + how serious */}
      <View style={styles.topRow}>
        <View style={[styles.badge, { backgroundColor: s.badge }]}>
          <Text style={[styles.badgeText, { color: s.text }]}>{s.label}</Text>
        </View>
        {recall.classification ? (
          <Text style={styles.classText}>{recall.classification}</Text>
        ) : null}
      </View>

      <Text style={styles.product} numberOfLines={3}>
        {recall.product_description || "Unknown product"}
      </Text>

      {/* 3: Why */}
      <View style={styles.reasonBlock}>
        <Text style={styles.sectionLabel}>Reason for recall</Text>
        <Text style={styles.reasonText} numberOfLines={expanded ? undefined : 2}>
          {recall.reason_for_recall || "No reason provided"}
        </Text>
      </View>

      {/* Meta */}
      <View style={styles.metaRow}>
        <MetaItem label="Company" value={recall.recalling_firm || "—"} />
        <View style={styles.metaDivider} />
        <MetaItem label="Date" value={formatDate(recall.report_date)} />
        {recall.recall_number ? (
          <>
            <View style={styles.metaDivider} />
            <MetaItem label="Recall #" value={recall.recall_number} mono />
          </>
        ) : null}
      </View>

      {/* 5: What should I do — expandable */}
      <Pressable onPress={toggle} style={styles.expandRow} hitSlop={8}>
        <Text style={[styles.expandLabel, { color: s.text }]}>What should I do?</Text>
        <Animated.Text style={[styles.chevron, { transform: [{ rotate: chevronRotate }] }]}>
          ↓
        </Animated.Text>
      </Pressable>

      {expanded && (
        <View style={styles.guidanceBlock}>
          {guidance.map((action, i) => (
            <View key={i} style={styles.guidanceLine}>
              <View style={[styles.guidancePip, { backgroundColor: s.bar }]} />
              <Text style={styles.guidanceText}>{action}</Text>
            </View>
          ))}
          {/* 6: Source */}
          <View style={styles.sourceRow}>
            <Text style={styles.sourceText}>Source: FDA Enforcement Database</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function MetaItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={[styles.metaValue, mono && styles.metaMono]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    marginHorizontal: spacing.xl,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  badgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  classText: { fontSize: 10, color: colors.textMuted, fontWeight: "600" },
  product: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    lineHeight: 21,
    letterSpacing: -0.2,
    marginBottom: spacing.md,
  },

  // reason
  reasonBlock: { marginBottom: spacing.md },
  sectionLabel: { ...type.label, marginBottom: 4 },
  reasonText: { ...type.body, fontSize: 13, lineHeight: 18 },

  // meta
  metaRow: {
    flexDirection: "row",
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginBottom: spacing.sm,
  },
  metaItem: { flex: 1 },
  metaLabel: { ...type.label, marginBottom: 3 },
  metaValue: { fontSize: 11, fontWeight: "600", color: colors.textSoft },
  metaMono: { fontVariant: ["tabular-nums"] },
  metaDivider: { width: 1, backgroundColor: colors.border, marginHorizontal: spacing.md },

  // expand
  expandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  expandLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 0.2 },
  chevron: { fontSize: 14, color: colors.textMuted },

  // guidance
  guidanceBlock: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  guidanceLine: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  guidancePip: { width: 5, height: 5, borderRadius: 3, marginTop: 6, flexShrink: 0 },
  guidanceText: { ...type.body, fontSize: 13, flex: 1 },
  sourceRow: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  sourceText: { fontSize: 10, color: colors.textMuted, letterSpacing: 0.3 },
});
