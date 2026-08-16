import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors, radius, spacing, type } from "../theme";
import { SHEETBEST } from "../lib/api";

const TOTAL_STEPS = 4; // steps 1–4 (0 is welcome)

type Profile = {
  householdSize: number;
  vulnerabilities: string[];
  allergies: string[];
  medicationsFlag: boolean;
  categories: string[];
  alertThreshold: "HIGH" | "ALL";
  name: string;
  email: string;
  zip: string;
};

const DEFAULT_PROFILE: Profile = {
  householdSize: 1,
  vulnerabilities: [],
  allergies: [],
  medicationsFlag: false,
  categories: ["food", "drug", "device"],
  alertThreshold: "ALL",
  name: "",
  email: "",
  zip: "",
};

// ── chip helpers ────────────────────────────────────────────────────────────
function toggle<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

function Chip({
  label,
  active,
  onPress,
  accent,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  accent?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        active && (accent ? styles.chipAccentActive : styles.chipActive),
      ]}
    >
      <Text
        style={[
          styles.chipText,
          active && (accent ? styles.chipAccentText : styles.chipActiveText),
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ── progress dots ───────────────────────────────────────────────────────────
function ProgressDots({ step }: { step: number }) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <View
          key={i}
          style={[styles.dot, i < step && styles.dotActive, i === step - 1 && styles.dotCurrent]}
        />
      ))}
    </View>
  );
}

// ── main component ──────────────────────────────────────────────────────────
export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const slideAnim = useRef(new Animated.Value(0)).current;

  const p = (patch: Partial<Profile>) => setProfile((prev) => ({ ...prev, ...patch }));

  const advance = () => {
    Animated.sequence([
      Animated.timing(slideAnim, { toValue: -30, duration: 160, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]).start();
    setStep((s) => s + 1);
  };

  const back = () => setStep((s) => Math.max(0, s - 1));

  const submit = async () => {
    if (!profile.email.trim() || !profile.email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await fetch(SHEETBEST, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.name.trim(),
          email: profile.email.trim().toLowerCase(),
          zip_code: profile.zip.trim(),
          household_size: profile.householdSize,
          vulnerabilities: profile.vulnerabilities.join(", "),
          allergies: profile.allergies.join(", "),
          medications_flag: profile.medicationsFlag,
          categories: profile.categories.join(", "),
          alert_threshold: profile.alertThreshold,
          source: "mobile_onboarding",
          timestamp: new Date().toISOString(),
        }),
      });
    } catch {
      // Non-blocking — proceed even if SheetBest is down
    }
    await AsyncStorage.setItem("@rr:onboarded", "true");
    await AsyncStorage.setItem("@rr:profile", JSON.stringify(profile));
    setSubmitting(false);
    onComplete();
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Animated.View style={[styles.screen, { transform: [{ translateY: slideAnim }] }]}>
        {step === 0 && <StepWelcome onNext={advance} />}
        {step === 1 && (
          <StepHousehold
            profile={profile}
            update={p}
            onNext={advance}
            onBack={back}
          />
        )}
        {step === 2 && (
          <StepSensitivities
            profile={profile}
            update={p}
            onNext={advance}
            onBack={back}
          />
        )}
        {step === 3 && (
          <StepCategories
            profile={profile}
            update={p}
            onNext={advance}
            onBack={back}
          />
        )}
        {step === 4 && (
          <StepContact
            profile={profile}
            update={p}
            onSubmit={submit}
            onBack={back}
            submitting={submitting}
            error={error}
          />
        )}
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

// ── Step 0: Welcome ─────────────────────────────────────────────────────────
function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <ScrollView contentContainerStyle={styles.welcomeContent} showsVerticalScrollIndicator={false}>
      <View style={styles.welcomeOrb}>
        <Text style={styles.orbRing}>◎</Text>
      </View>

      <Text style={styles.welcomeWordmark}>
        RECALL<Text style={{ color: colors.accent }}>RADAR</Text>
      </Text>

      <Text style={styles.welcomeHero}>Never find out{"\n"}too late.</Text>

      <Text style={styles.welcomeBody}>
        RecallRadar monitors what you eat, use, drive, and bring home — so you know when
        something becomes unsafe and what to do next.
      </Text>

      <View style={styles.benefitList}>
        {[
          { icon: "⊙", text: "Live FDA recall intelligence" },
          { icon: "◈", text: "Personalized to your household" },
          { icon: "◇", text: "Actionable, not just informational" },
        ].map(({ icon, text }) => (
          <View key={text} style={styles.benefitRow}>
            <Text style={styles.benefitIcon}>{icon}</Text>
            <Text style={styles.benefitText}>{text}</Text>
          </View>
        ))}
      </View>

      <Pressable
        style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
        onPress={onNext}
      >
        <Text style={styles.primaryBtnText}>Build my safety profile →</Text>
      </Pressable>

      <Text style={styles.welcomeDisclaimer}>
        Takes 60 seconds · No credit card · Private by design
      </Text>
    </ScrollView>
  );
}

// ── Step 1: Household ───────────────────────────────────────────────────────
const VULNERABILITIES = [
  "Young children (under 12)",
  "Teens (12–17)",
  "Elderly adults (65+)",
  "Expecting / pregnant",
];

const SIZES = [1, 2, 3, 4, "5+"];

function StepHousehold({
  profile,
  update,
  onNext,
  onBack,
}: {
  profile: Profile;
  update: (p: Partial<Profile>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <View style={styles.stepRoot}>
      <StepHeader step={1} title="Who are you protecting?" onBack={onBack} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.stepContent}>
        <Text style={styles.fieldLabel}>Household size</Text>
        <View style={styles.sizeRow}>
          {SIZES.map((s) => {
            const val = s === "5+" ? 5 : (s as number);
            return (
              <Pressable
                key={String(s)}
                onPress={() => update({ householdSize: val })}
                style={[styles.sizeBox, profile.householdSize === val && styles.sizeBoxActive]}
              >
                <Text style={[styles.sizeText, profile.householdSize === val && styles.sizeTextActive]}>
                  {s}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>
          Anyone in your household who may be more vulnerable?
        </Text>
        <View style={styles.chipWrap}>
          {VULNERABILITIES.map((v) => (
            <Chip
              key={v}
              label={v}
              active={profile.vulnerabilities.includes(v)}
              onPress={() => update({ vulnerabilities: toggle(profile.vulnerabilities, v) })}
            />
          ))}
        </View>

        <View style={styles.contextBox}>
          <Text style={styles.contextText}>
            Children and the elderly are often at higher risk from the same recall event.
            This helps us flag what matters most for your household.
          </Text>
        </View>
      </ScrollView>

      <NextButton onPress={onNext} />
    </View>
  );
}

// ── Step 2: Sensitivities ───────────────────────────────────────────────────
const ALLERGIES = [
  "Peanuts", "Tree nuts", "Dairy", "Gluten", "Shellfish",
  "Eggs", "Soy", "Sesame", "Fish",
];

function StepSensitivities({
  profile,
  update,
  onNext,
  onBack,
}: {
  profile: Profile;
  update: (p: Partial<Profile>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <View style={styles.stepRoot}>
      <StepHeader step={2} title="Any food sensitivities?" onBack={onBack} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.stepContent}>
        <Text style={styles.fieldLabel}>Select all that apply</Text>
        <View style={styles.chipWrap}>
          {ALLERGIES.map((a) => (
            <Chip
              key={a}
              label={a}
              active={profile.allergies.includes(a)}
              onPress={() => update({ allergies: toggle(profile.allergies, a) })}
              accent
            />
          ))}
        </View>

        <View style={styles.contextBox}>
          <Text style={styles.contextText}>
            ~40% of FDA food recalls involve undeclared allergens. Knowing yours means we surface
            the alerts that could actually harm your household — and mute the noise.
          </Text>
        </View>

        <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>
          Does anyone in your household manage medications?
        </Text>
        <View style={styles.toggleRow}>
          {([false, true] as const).map((val) => (
            <Pressable
              key={String(val)}
              onPress={() => update({ medicationsFlag: val })}
              style={[styles.toggleBtn, profile.medicationsFlag === val && styles.toggleBtnActive]}
            >
              <Text style={[styles.toggleText, profile.medicationsFlag === val && styles.toggleTextActive]}>
                {val ? "Yes" : "No"}
              </Text>
            </Pressable>
          ))}
        </View>
        {profile.medicationsFlag && (
          <Text style={styles.hintText}>
            Drug recall alerts will appear in your personalized feed.
          </Text>
        )}
      </ScrollView>

      <NextButton onPress={onNext} />
    </View>
  );
}

// ── Step 3: Categories ──────────────────────────────────────────────────────
const CATEGORY_OPTIONS = [
  { id: "food", label: "Food & Grocery", sub: "FDA food enforcement" },
  { id: "drug", label: "Medicine", sub: "FDA drug enforcement" },
  { id: "device", label: "Medical Devices", sub: "FDA device enforcement" },
  { id: "consumer", label: "Consumer Products", sub: "CPSC safety database" },
  { id: "vehicle", label: "Vehicles", sub: "NHTSA recall database" },
];

function StepCategories({
  profile,
  update,
  onNext,
  onBack,
}: {
  profile: Profile;
  update: (p: Partial<Profile>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <View style={styles.stepRoot}>
      <StepHeader step={3} title="What should we watch?" onBack={onBack} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.stepContent}>
        <Text style={styles.fieldLabel}>Monitor these categories</Text>
        {CATEGORY_OPTIONS.map(({ id, label, sub }) => {
          const active = profile.categories.includes(id);
          return (
            <Pressable
              key={id}
              onPress={() => update({ categories: toggle(profile.categories, id) })}
              style={[styles.categoryRow, active && styles.categoryRowActive]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.categoryLabel, active && { color: colors.text }]}>{label}</Text>
                <Text style={styles.categorySub}>{sub}</Text>
              </View>
              <View style={[styles.checkCircle, active && styles.checkCircleActive]}>
                {active && <Text style={styles.checkMark}>✓</Text>}
              </View>
            </Pressable>
          );
        })}

        <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>Alert threshold</Text>
        {(["HIGH", "ALL"] as const).map((thresh) => (
          <Pressable
            key={thresh}
            onPress={() => update({ alertThreshold: thresh })}
            style={[styles.threshRow, profile.alertThreshold === thresh && styles.threshRowActive]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.threshLabel, profile.alertThreshold === thresh && { color: colors.text }]}>
                {thresh === "HIGH" ? "High risk only" : "All recalls"}
              </Text>
              <Text style={styles.threshSub}>
                {thresh === "HIGH"
                  ? "Class I recalls — immediate danger to health"
                  : "All FDA enforcement actions, including Class II and III"}
              </Text>
            </View>
            <View style={[styles.radio, profile.alertThreshold === thresh && styles.radioActive]} />
          </Pressable>
        ))}
      </ScrollView>

      <NextButton onPress={onNext} />
    </View>
  );
}

// ── Step 4: Contact ─────────────────────────────────────────────────────────
function StepContact({
  profile,
  update,
  onSubmit,
  onBack,
  submitting,
  error,
}: {
  profile: Profile;
  update: (p: Partial<Profile>) => void;
  onSubmit: () => void;
  onBack: () => void;
  submitting: boolean;
  error: string;
}) {
  return (
    <View style={styles.stepRoot}>
      <StepHeader step={4} title="Almost done." onBack={onBack} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.stepContent}>
        <Text style={styles.fieldLabel}>First name</Text>
        <TextInput
          style={styles.textInput}
          value={profile.name}
          onChangeText={(v) => update({ name: v })}
          placeholder="Your first name"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="words"
          autoCorrect={false}
          selectionColor={colors.accent}
        />

        <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>
          Email <Text style={{ color: colors.alert }}>*</Text>
        </Text>
        <TextInput
          style={styles.textInput}
          value={profile.email}
          onChangeText={(v) => update({ email: v })}
          placeholder="you@example.com"
          placeholderTextColor={colors.textMuted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          selectionColor={colors.accent}
        />

        <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>
          ZIP code <Text style={styles.optionalTag}>(optional)</Text>
        </Text>
        <TextInput
          style={styles.textInput}
          value={profile.zip}
          onChangeText={(v) => update({ zip: v.replace(/\D/g, "").slice(0, 5) })}
          placeholder="90210"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          maxLength={5}
          selectionColor={colors.accent}
        />
        <Text style={styles.hintText}>
          Used for location-relevant enforcement actions only.
        </Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.privacyBox}>
          <Text style={styles.privacyText}>
            ◈ Your profile is private and used only to personalize your recall alerts.
            We never sell your data. You can update your preferences at any time.
          </Text>
        </View>
      </ScrollView>

      <Pressable
        style={({ pressed }) => [styles.primaryBtn, styles.submitBtn, pressed && { opacity: 0.85 }]}
        onPress={onSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fbf1ec" size="small" />
        ) : (
          <Text style={styles.primaryBtnText}>Create my safety profile →</Text>
        )}
      </Pressable>
    </View>
  );
}

// ── shared sub-components ───────────────────────────────────────────────────
function StepHeader({
  step,
  title,
  onBack,
}: {
  step: number;
  title: string;
  onBack: () => void;
}) {
  return (
    <View style={styles.stepHeaderWrap}>
      <View style={styles.stepTopRow}>
        <Pressable onPress={onBack} style={styles.backBtn} hitSlop={12}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <Text style={styles.stepCounter}>{step} of {TOTAL_STEPS}</Text>
      </View>
      <ProgressDots step={step} />
      <Text style={styles.stepTitle}>{title}</Text>
    </View>
  );
}

function NextButton({ onPress, label = "Continue →" }: { onPress: () => void; label?: string }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.primaryBtn, styles.nextBtn, pressed && { opacity: 0.85 }]}
      onPress={onPress}
    >
      <Text style={styles.primaryBtnText}>{label}</Text>
    </Pressable>
  );
}

// ── styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  screen: { flex: 1 },

  // welcome
  welcomeContent: {
    flexGrow: 1,
    padding: spacing.xl,
    paddingTop: 64,
    alignItems: "center",
  },
  welcomeOrb: { marginBottom: spacing.xl },
  orbRing: { fontSize: 64, color: colors.accent, opacity: 0.85 },
  welcomeWordmark: {
    fontSize: 14,
    fontWeight: "200",
    letterSpacing: 5,
    color: colors.text,
    marginBottom: spacing.xl,
  },
  welcomeHero: {
    fontSize: 36,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -1,
    lineHeight: 42,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  welcomeBody: {
    ...type.body,
    textAlign: "center",
    maxWidth: 300,
    marginBottom: spacing.xxl,
    lineHeight: 22,
  },
  benefitList: { width: "100%", gap: spacing.md, marginBottom: spacing.xxl },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  benefitIcon: { fontSize: 16, color: colors.accent, width: 20 },
  benefitText: { ...type.body, flex: 1 },
  welcomeDisclaimer: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: spacing.md,
    letterSpacing: 0.2,
  },

  // steps
  stepRoot: { flex: 1 },
  stepHeaderWrap: {
    paddingHorizontal: spacing.xl,
    paddingTop: 56,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stepTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  backBtn: {},
  backText: { fontSize: 14, color: colors.textMuted, fontWeight: "500" },
  stepCounter: { ...type.label },
  stepTitle: { ...type.h1, marginTop: spacing.md },
  stepContent: { padding: spacing.xl, paddingBottom: spacing.xxl },

  // progress dots
  dotsRow: { flexDirection: "row", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.accent, opacity: 0.4 },
  dotCurrent: { backgroundColor: colors.accent, opacity: 1, width: 18 },

  // buttons
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: "center",
    marginHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
  nextBtn: {},
  submitBtn: {},
  primaryBtnText: { color: "#fbf1ec", fontWeight: "700", fontSize: 15, letterSpacing: 0.3 },

  // fields
  fieldLabel: { ...type.label, marginBottom: spacing.sm },
  textInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    color: colors.text,
    fontSize: 15,
  },
  optionalTag: { color: colors.textMuted, fontWeight: "400", textTransform: "none", letterSpacing: 0 },
  hintText: { fontSize: 11, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 16 },

  // chips
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "transparent",
  },
  chipActive: { backgroundColor: colors.surface2, borderColor: colors.borderStrong },
  chipAccentActive: { backgroundColor: "rgba(198,91,69,0.15)", borderColor: colors.accent },
  chipText: { fontSize: 13, color: colors.textMuted, fontWeight: "500" },
  chipActiveText: { color: colors.text },
  chipAccentText: { color: colors.accent, fontWeight: "600" },

  // household size
  sizeRow: { flexDirection: "row", gap: spacing.sm },
  sizeBox: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  sizeBoxActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  sizeText: { fontSize: 16, fontWeight: "700", color: colors.textMuted },
  sizeTextActive: { color: "#fbf1ec" },

  // yes/no toggle
  toggleRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  toggleBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  toggleBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  toggleText: { fontSize: 14, fontWeight: "600", color: colors.textMuted },
  toggleTextActive: { color: "#fbf1ec" },

  // category rows
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
  },
  categoryRowActive: { borderColor: colors.accent, backgroundColor: "rgba(198,91,69,0.08)" },
  categoryLabel: { fontSize: 14, fontWeight: "600", color: colors.textSoft, marginBottom: 2 },
  categorySub: { fontSize: 11, color: colors.textMuted },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircleActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkMark: { fontSize: 11, color: "#fbf1ec", fontWeight: "800" },

  // threshold rows
  threshRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
  },
  threshRowActive: { borderColor: colors.accent, backgroundColor: "rgba(198,91,69,0.08)" },
  threshLabel: { fontSize: 14, fontWeight: "600", color: colors.textSoft, marginBottom: 2 },
  threshSub: { fontSize: 11, color: colors.textMuted, lineHeight: 16 },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginLeft: spacing.md,
  },
  radioActive: { borderColor: colors.accent, backgroundColor: colors.accent },

  // context / privacy boxes
  contextBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
    marginTop: spacing.lg,
  },
  contextText: { fontSize: 12, color: colors.textSoft, lineHeight: 18 },
  privacyBox: {
    marginTop: spacing.xl,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  privacyText: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },

  // error
  errorBox: {
    marginTop: spacing.md,
    backgroundColor: "rgba(255,59,48,0.1)",
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255,59,48,0.25)",
  },
  errorText: { fontSize: 13, color: colors.alert },
});
