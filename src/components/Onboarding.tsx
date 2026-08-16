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
import * as Location from "expo-location";
import { darkColors, lightColors, makeType, spacing, type ThemeMode } from "../theme";
import { useTheme } from "../context/ThemeContext";
import { SHEETBEST } from "../lib/api";
import { supabase } from "../lib/supabase";

const TOTAL_STEPS = 4;

type Profile = {
  householdSize: number;
  vulnerabilities: string[];
  allergies: string[];
  medicationsFlag: boolean;
  categories: string[];
  alertThreshold: "HIGH" | "ALL";
  name: string;
  email: string;
  password: string;
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
  password: "",
  zip: "",
};

function toggle<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

// ── chip ────────────────────────────────────────────────────────────────────
function Chip({
  label,
  active,
  onPress,
  accent,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  accent?: boolean;
  colors: ReturnType<typeof darkColors | typeof lightColors | any>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        chip.base,
        { borderColor: colors.border, backgroundColor: "transparent" },
        active && !accent && { backgroundColor: colors.surface2, borderColor: colors.borderStrong },
        active && accent && { backgroundColor: "rgba(198,91,69,0.15)", borderColor: colors.accent },
      ]}
    >
      <Text
        style={[
          chip.text,
          { color: colors.textMuted },
          active && !accent && { color: colors.text },
          active && accent && { color: colors.accent, fontWeight: "600" },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const chip = StyleSheet.create({
  base: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  text: { fontSize: 13, fontWeight: "500" },
});

// ── progress dots ───────────────────────────────────────────────────────────
function ProgressDots({ step, accent }: { step: number; accent: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <View
          key={i}
          style={{
            height: 6,
            borderRadius: 3,
            width: i === step - 1 ? 18 : 6,
            backgroundColor: i < step ? accent : "rgba(120,110,100,0.3)",
            opacity: i === step - 1 ? 1 : i < step - 1 ? 0.5 : 1,
          }}
        />
      ))}
    </View>
  );
}

// ── main component ──────────────────────────────────────────────────────────
export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const { colors, mode, setMode } = useTheme();
  const t = makeType(colors);
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const slideAnim = useRef(new Animated.Value(0)).current;

  const p = (patch: Partial<Profile>) => setProfile((prev) => ({ ...prev, ...patch }));

  const advance = () => {
    Animated.sequence([
      Animated.timing(slideAnim, { toValue: -24, duration: 140, useNativeDriver: true }),
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
    if (profile.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const email = profile.email.trim().toLowerCase();

      // Try sign-up first; if already registered, sign in instead
      let userId: string | undefined;
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password: profile.password,
      });

      if (signUpError) {
        if (signUpError.message.toLowerCase().includes("already registered")) {
          // Returning user after reinstall — sign them back in
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password: profile.password,
          });
          if (signInError) {
            setError("This email is already registered. Check your password.");
            setSubmitting(false);
            return;
          }
          userId = signInData.user?.id;
        } else {
          setError(signUpError.message);
          setSubmitting(false);
          return;
        }
      } else {
        userId = signUpData.user?.id;
      }

      // Save household profile to Supabase
      if (userId) {
        await supabase.from("users").upsert({
          id:                   userId,
          name:                 profile.name.trim(),
          zip_code:             profile.zip.trim(),
          household_size:       profile.householdSize,
          vulnerabilities:      profile.vulnerabilities,
          allergies:            profile.allergies,
          medications_flag:     profile.medicationsFlag,
          alert_threshold:      profile.alertThreshold,
          monitored_categories: profile.categories,
          theme:                mode,
        });
      }

      // SheetBest analytics capture — fire and forget
      fetch(SHEETBEST, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.name.trim(), email,
          zip_code: profile.zip.trim(), household_size: profile.householdSize,
          vulnerabilities: profile.vulnerabilities.join(", "),
          allergies: profile.allergies.join(", "),
          medications_flag: profile.medicationsFlag,
          categories: profile.categories.join(", "),
          alert_threshold: profile.alertThreshold,
          app_theme: mode, source: "mobile_onboarding",
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {});

      // Local cache — works offline and before email is confirmed
      await AsyncStorage.setItem("@rr:onboarded", userId ?? "true");
      await AsyncStorage.setItem("@rr:profile", JSON.stringify(profile));
      onComplete();
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setSubmitting(false);
  };

  const sharedProps = { colors, t, accent: colors.accent };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Animated.View style={[styles.screen, { transform: [{ translateY: slideAnim }] }]}>
        {step === 0 && (
          <StepWelcome {...sharedProps} mode={mode} onModeChange={setMode} onNext={advance} />
        )}
        {step === 1 && (
          <StepHousehold {...sharedProps} profile={profile} update={p} onNext={advance} onBack={back} />
        )}
        {step === 2 && (
          <StepSensitivities {...sharedProps} profile={profile} update={p} onNext={advance} onBack={back} />
        )}
        {step === 3 && (
          <StepCategories {...sharedProps} profile={profile} update={p} onNext={advance} onBack={back} />
        )}
        {step === 4 && (
          <StepContact
            {...sharedProps}
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

// ── shared step header ──────────────────────────────────────────────────────
function StepHeader({
  step,
  title,
  onBack,
  colors,
  t,
  accent,
}: {
  step: number;
  title: string;
  onBack: () => void;
  colors: any;
  t: any;
  accent: string;
}) {
  return (
    <View style={[styles.stepHeader, { borderBottomColor: colors.border }]}>
      <View style={styles.stepTopRow}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={{ fontSize: 14, color: colors.textMuted, fontWeight: "500" }}>← Back</Text>
        </Pressable>
        <Text style={{ fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: "600", color: colors.textMuted }}>
          {step} of {TOTAL_STEPS}
        </Text>
      </View>
      <ProgressDots step={step} accent={accent} />
      <Text style={[t.h1, { marginTop: 12 }]}>{title}</Text>
    </View>
  );
}

function NextButton({
  onPress,
  label = "Continue →",
  colors,
}: {
  onPress: () => void;
  label?: string;
  colors: any;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 }]}
      onPress={onPress}
    >
      <Text style={styles.primaryBtnText}>{label}</Text>
    </Pressable>
  );
}

// ── Step 0: Welcome ─────────────────────────────────────────────────────────
function StepWelcome({
  colors, t, accent, mode, onModeChange, onNext,
}: {
  colors: any; t: any; accent: string; mode: ThemeMode; onModeChange: (m: ThemeMode) => void; onNext: () => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={[styles.welcomeContent]}
      showsVerticalScrollIndicator={false}
    >
      {/* Theme toggle — top right */}
      <View style={styles.welcomeTopBar}>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => onModeChange(mode === "dark" ? "light" : "dark")}
          style={[styles.themeToggle, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={{ fontSize: 13 }}>{mode === "dark" ? "☀" : "☾"}</Text>
          <Text style={{ fontSize: 11, color: colors.textSoft, fontWeight: "600" }}>
            {mode === "dark" ? "Light" : "Dark"}
          </Text>
        </Pressable>
      </View>

      <Text style={{ fontSize: 40, color: accent, opacity: 0.85, marginBottom: spacing.xl }}>◎</Text>

      <Text style={[styles.wordmark, { color: colors.text }]}>
        RECALL<Text style={{ color: accent }}>RADAR</Text>
      </Text>

      <Text style={[styles.welcomeHero, { color: colors.text }]}>
        Never find out{"\n"}too late.
      </Text>

      <Text style={[t.body, styles.welcomeBody]}>
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
            <Text style={{ fontSize: 15, color: accent, width: 22 }}>{icon}</Text>
            <Text style={[t.body, { flex: 1 }]}>{text}</Text>
          </View>
        ))}
      </View>

      <Pressable
        style={({ pressed }) => [styles.primaryBtn, { backgroundColor: accent, opacity: pressed ? 0.85 : 1, width: "100%" }]}
        onPress={onNext}
      >
        <Text style={styles.primaryBtnText}>Build my safety profile →</Text>
      </Pressable>

      <Text style={[styles.disclaimer, { color: colors.textMuted }]}>
        Takes 60 seconds · No credit card · Private by design
      </Text>
    </ScrollView>
  );
}

// ── Step 1: Household ───────────────────────────────────────────────────────
const VULNERABILITIES = [
  "Young children (under 12)", "Teens (12–17)", "Elderly adults (65+)", "Expecting / pregnant",
];
const SIZES = [1, 2, 3, 4, "5+"];

function StepHousehold({ colors, t, accent, profile, update, onNext, onBack }: any) {
  return (
    <View style={styles.stepRoot}>
      <StepHeader step={1} title="Who are you protecting?" onBack={onBack} colors={colors} t={t} accent={accent} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.stepBody}>
        <Text style={[t.label, styles.fieldGap]}>Household size</Text>
        <View style={styles.sizeRow}>
          {SIZES.map((s) => {
            const val = s === "5+" ? 5 : (s as number);
            const active = profile.householdSize === val;
            return (
              <Pressable
                key={String(s)}
                onPress={() => update({ householdSize: val })}
                style={[styles.sizeBox, { borderColor: colors.border, backgroundColor: colors.surface }, active && { backgroundColor: accent, borderColor: accent }]}
              >
                <Text style={{ fontSize: 16, fontWeight: "700", color: active ? "#fbf1ec" : colors.textMuted }}>{s}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[t.label, styles.fieldGapLg]}>Vulnerable household members</Text>
        <View style={styles.chipWrap}>
          {VULNERABILITIES.map((v) => (
            <Chip key={v} label={v} active={profile.vulnerabilities.includes(v)} onPress={() => update({ vulnerabilities: toggle(profile.vulnerabilities, v) })} colors={colors} />
          ))}
        </View>

        <View style={[styles.contextBox, { backgroundColor: colors.surface, borderLeftColor: accent }]}>
          <Text style={{ fontSize: 12, color: colors.textSoft, lineHeight: 18 }}>
            Children and elderly adults often face higher risk from the same recall event — this shapes
            how we prioritize alerts for your household.
          </Text>
        </View>
      </ScrollView>
      <NextButton onPress={onNext} colors={colors} />
    </View>
  );
}

// ── Step 2: Sensitivities ───────────────────────────────────────────────────
const ALLERGIES = ["Peanuts", "Tree nuts", "Dairy", "Gluten", "Shellfish", "Eggs", "Soy", "Sesame", "Fish"];

function StepSensitivities({ colors, t, accent, profile, update, onNext, onBack }: any) {
  return (
    <View style={styles.stepRoot}>
      <StepHeader step={2} title="Any food sensitivities?" onBack={onBack} colors={colors} t={t} accent={accent} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.stepBody}>
        <Text style={[t.label, styles.fieldGap]}>Select all that apply</Text>
        <View style={styles.chipWrap}>
          {ALLERGIES.map((a) => (
            <Chip key={a} label={a} active={profile.allergies.includes(a)} onPress={() => update({ allergies: toggle(profile.allergies, a) })} accent colors={colors} />
          ))}
        </View>
        <View style={[styles.contextBox, { backgroundColor: colors.surface, borderLeftColor: accent, marginBottom: spacing.xl }]}>
          <Text style={{ fontSize: 12, color: colors.textSoft, lineHeight: 18 }}>
            ~40% of FDA food recalls involve undeclared allergens. Knowing yours helps us surface only
            the recalls that could actually affect your household.
          </Text>
        </View>

        <Text style={[t.label, styles.fieldGap]}>Does anyone manage medications?</Text>
        <View style={styles.toggleRow}>
          {([false, true] as const).map((val) => {
            const active = profile.medicationsFlag === val;
            return (
              <Pressable key={String(val)} onPress={() => update({ medicationsFlag: val })}
                style={[styles.toggleBtn, { borderColor: colors.border, backgroundColor: colors.surface }, active && { backgroundColor: accent, borderColor: accent }]}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: active ? "#fbf1ec" : colors.textMuted }}>{val ? "Yes" : "No"}</Text>
              </Pressable>
            );
          })}
        </View>
        {profile.medicationsFlag && (
          <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 16 }}>
            Drug recall alerts will appear in your personalized feed.
          </Text>
        )}
      </ScrollView>
      <NextButton onPress={onNext} colors={colors} />
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

function StepCategories({ colors, t, accent, profile, update, onNext, onBack }: any) {
  return (
    <View style={styles.stepRoot}>
      <StepHeader step={3} title="What should we watch?" onBack={onBack} colors={colors} t={t} accent={accent} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.stepBody}>
        <Text style={[t.label, styles.fieldGap]}>Monitor these categories</Text>
        {CATEGORY_OPTIONS.map(({ id, label, sub }) => {
          const active = profile.categories.includes(id);
          return (
            <Pressable key={id} onPress={() => update({ categories: toggle(profile.categories, id) })}
              style={[styles.categoryRow, { borderColor: colors.border, backgroundColor: colors.surface }, active && { borderColor: accent, backgroundColor: "rgba(198,91,69,0.08)" }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: active ? colors.text : colors.textSoft, marginBottom: 2 }}>{label}</Text>
                <Text style={{ fontSize: 11, color: colors.textMuted }}>{sub}</Text>
              </View>
              <View style={[styles.checkCircle, { borderColor: colors.border }, active && { backgroundColor: accent, borderColor: accent }]}>
                {active && <Text style={{ fontSize: 10, color: "#fbf1ec", fontWeight: "800" }}>✓</Text>}
              </View>
            </Pressable>
          );
        })}

        <Text style={[t.label, { marginTop: spacing.xl, marginBottom: spacing.sm }]}>Alert threshold</Text>
        {(["HIGH", "ALL"] as const).map((thresh) => {
          const active = profile.alertThreshold === thresh;
          return (
            <Pressable key={thresh} onPress={() => update({ alertThreshold: thresh })}
              style={[styles.categoryRow, { borderColor: colors.border, backgroundColor: colors.surface }, active && { borderColor: accent, backgroundColor: "rgba(198,91,69,0.08)" }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: active ? colors.text : colors.textSoft, marginBottom: 2 }}>
                  {thresh === "HIGH" ? "High risk only" : "All recalls"}
                </Text>
                <Text style={{ fontSize: 11, color: colors.textMuted, lineHeight: 16 }}>
                  {thresh === "HIGH" ? "Class I recalls — immediate danger to health" : "All FDA enforcement actions, including Class II and III"}
                </Text>
              </View>
              <View style={[styles.radio, { borderColor: active ? accent : colors.border }, active && { backgroundColor: accent }]} />
            </Pressable>
          );
        })}
      </ScrollView>
      <NextButton onPress={onNext} colors={colors} />
    </View>
  );
}

// ── Step 4: Contact ─────────────────────────────────────────────────────────
function StepContact({ colors, t, accent, profile, update, onSubmit, onBack, submitting, error }: any) {
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState("");

  const detectLocation = async () => {
    setLocating(true);
    setLocError("");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocError("Location permission denied. Enter your ZIP manually.");
        setLocating(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      // Reverse geocode via OpenStreetMap Nominatim (free, no key)
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`,
        { headers: { "User-Agent": "RecallRadar/1.0" } }
      );
      const geo = await res.json();
      const zip = geo?.address?.postcode?.split("-")[0] ?? "";
      if (zip && /^\d{5}$/.test(zip)) {
        update({ zip });
        setLocError("");
      } else {
        setLocError("Couldn't detect ZIP — enter it manually.");
      }
    } catch {
      setLocError("Location unavailable. Enter your ZIP manually.");
    }
    setLocating(false);
  };

  return (
    <View style={styles.stepRoot}>
      <StepHeader step={4} title="Almost done." onBack={onBack} colors={colors} t={t} accent={accent} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.stepBody}>
        <Text style={[t.label, styles.fieldGap]}>First name</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          value={profile.name}
          onChangeText={(v) => update({ name: v })}
          placeholder="Your first name"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="words"
          autoCorrect={false}
          selectionColor={accent}
        />

        <Text style={[t.label, styles.fieldGapLg]}>
          Email <Text style={{ color: accent }}>*</Text>
        </Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          value={profile.email}
          onChangeText={(v) => update({ email: v })}
          placeholder="you@example.com"
          placeholderTextColor={colors.textMuted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          selectionColor={accent}
        />

        <Text style={[t.label, styles.fieldGapLg]}>
          Password <Text style={{ color: accent }}>*</Text>
        </Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          value={profile.password}
          onChangeText={(v) => update({ password: v })}
          placeholder="6+ characters"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          selectionColor={accent}
        />

        <Text style={[t.label, styles.fieldGapLg]}>
          ZIP code <Text style={{ color: colors.textMuted, fontWeight: "400", textTransform: "none", letterSpacing: 0 }}>(optional)</Text>
        </Text>
        <View style={styles.zipRow}>
          <TextInput
            style={[styles.input, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
            value={profile.zip}
            onChangeText={(v) => update({ zip: v.replace(/\D/g, "").slice(0, 5) })}
            placeholder="90210"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            maxLength={5}
            selectionColor={accent}
          />
          <Pressable
            onPress={detectLocation}
            disabled={locating}
            style={({ pressed }) => [
              styles.locBtn,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed && { opacity: 0.7 },
            ]}
          >
            {locating ? (
              <ActivityIndicator size="small" color={accent} />
            ) : (
              <>
                <Text style={{ fontSize: 15 }}>◎</Text>
                <Text style={{ fontSize: 11, color: colors.textSoft, fontWeight: "600", marginTop: 2 }}>Detect</Text>
              </>
            )}
          </Pressable>
        </View>
        {locError ? (
          <Text style={{ fontSize: 11, color: colors.alert, marginTop: spacing.sm }}>{locError}</Text>
        ) : profile.zip.length === 5 ? (
          <Text style={{ fontSize: 11, color: colors.safe, marginTop: spacing.sm }}>✓ ZIP detected</Text>
        ) : (
          <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 16 }}>
            Used for location-relevant enforcement actions only.
          </Text>
        )}

        {error ? (
          <View style={[styles.errorBox, { backgroundColor: "rgba(255,59,48,0.1)", borderColor: "rgba(255,59,48,0.25)" }]}>
            <Text style={{ fontSize: 13, color: colors.alert }}>{error}</Text>
          </View>
        ) : null}

        <View style={[styles.privacyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={{ fontSize: 12, color: colors.textMuted, lineHeight: 18 }}>
            ◈  Your profile is private and used only to personalize your recall alerts.
            We never sell your data. You can update your preferences at any time.
          </Text>
        </View>
      </ScrollView>

      <Pressable
        style={({ pressed }) => [styles.primaryBtn, { backgroundColor: accent, opacity: pressed ? 0.85 : 1 }]}
        onPress={onSubmit}
        disabled={submitting}
      >
        {submitting ? <ActivityIndicator color="#fbf1ec" size="small" /> : (
          <Text style={styles.primaryBtnText}>Create my safety profile →</Text>
        )}
      </Pressable>
    </View>
  );
}

// ── styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },
  screen: { flex: 1 },

  // welcome
  welcomeContent: {
    flexGrow: 1,
    padding: spacing.xl,
    paddingTop: 56,
    alignItems: "center",
  },
  welcomeTopBar: {
    flexDirection: "row",
    width: "100%",
    marginBottom: spacing.xl,
    alignItems: "center",
  },
  themeToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  wordmark: {
    fontSize: 14,
    fontWeight: "200",
    letterSpacing: 5,
    marginBottom: spacing.xl,
  },
  welcomeHero: {
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: -1,
    lineHeight: 42,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  welcomeBody: { textAlign: "center", maxWidth: 300, marginBottom: spacing.xxl, lineHeight: 22 },
  benefitList: { width: "100%", gap: spacing.md, marginBottom: spacing.xxl },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  disclaimer: { fontSize: 11, marginTop: spacing.md, letterSpacing: 0.2 },

  // step shell
  stepRoot: { flex: 1 },
  stepHeader: {
    paddingHorizontal: spacing.xl,
    paddingTop: 56,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
  },
  stepTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  stepBody: { padding: spacing.xl, paddingBottom: spacing.xxl },

  // shared
  fieldGap: { marginBottom: spacing.sm },
  fieldGapLg: { marginTop: spacing.lg, marginBottom: spacing.sm },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  sizeRow: { flexDirection: "row", gap: spacing.sm },
  sizeBox: {
    width: 52, height: 52, borderRadius: 12, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  contextBox: { padding: spacing.md, borderRadius: 12, borderLeftWidth: 2 },
  toggleRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  toggleBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, alignItems: "center",
  },
  categoryRow: {
    flexDirection: "row", alignItems: "center", padding: spacing.lg,
    borderRadius: 12, borderWidth: 1, marginBottom: spacing.sm,
  },
  checkCircle: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, marginLeft: spacing.md },

  // contact
  input: {
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: spacing.lg, paddingVertical: 14,
    fontSize: 15,
  },
  zipRow: { flexDirection: "row", gap: spacing.sm, alignItems: "stretch" },
  locBtn: {
    width: 68, borderRadius: 12, borderWidth: 1,
    alignItems: "center", justifyContent: "center", paddingVertical: 10,
  },
  errorBox: { marginTop: spacing.md, borderRadius: 12, padding: spacing.md, borderWidth: 1 },
  privacyBox: {
    marginTop: spacing.xl, padding: spacing.md, borderRadius: 12, borderWidth: 1,
  },

  // button
  primaryBtn: {
    borderRadius: 12, paddingVertical: 15,
    alignItems: "center", marginHorizontal: spacing.xl, marginBottom: spacing.xl,
  },
  primaryBtnText: { color: "#fbf1ec", fontWeight: "700", fontSize: 15, letterSpacing: 0.3 },
});
