import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius, spacing, type } from "../../src/theme";

export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const router = useRouter();

  const handleBarcode = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Navigate to search with the barcode value
    router.push({ pathname: "/", params: { q: data } });
  };

  if (!permission) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.body}>Requesting camera permission…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.heading}>Camera access needed</Text>
          <Text style={styles.body}>RecallRadar uses your camera to read product barcodes.</Text>
          <Pressable style={styles.btn} onPress={requestPermission}>
            <Text style={styles.btnText}>Grant permission</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarcode}
        barcodeScannerSettings={{ barcodeTypes: ["upc_a", "upc_e", "ean13", "ean8", "code128", "qr"] }}
      />

      {/* Overlay */}
      <View style={styles.overlay}>
        <SafeAreaView style={styles.topBar}>
          <Text style={styles.logo}>
            RECALL<Text style={{ color: colors.accent }}>RADAR</Text>
          </Text>
          <Text style={styles.hint}>Point at a product barcode</Text>
        </SafeAreaView>

        {/* Scan frame */}
        <View style={styles.frameContainer}>
          <View style={styles.frame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
        </View>

        {scanned && (
          <SafeAreaView edges={["bottom"]} style={styles.bottomBar}>
            <Text style={styles.scannedLabel}>Barcode captured — loading results…</Text>
            <Pressable style={styles.btn} onPress={() => setScanned(false)}>
              <Text style={styles.btnText}>Scan again</Text>
            </Pressable>
          </SafeAreaView>
        )}
      </View>
    </View>
  );
}

const FRAME = 260;
const CORNER = 24;
const BORDER = 3;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: "#000" },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: "space-between" },
  topBar: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
  },
  logo: {
    fontWeight: "200",
    fontSize: 16,
    letterSpacing: 4,
    color: "#fff",
  },
  hint: { color: "rgba(255,255,255,0.55)", fontSize: 13, letterSpacing: 0.3 },
  frameContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  frame: {
    width: FRAME,
    height: FRAME,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: CORNER,
    height: CORNER,
    borderColor: colors.accent,
    borderWidth: BORDER,
  },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  bottomBar: {
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.md,
  },
  scannedLabel: { color: "rgba(255,255,255,0.7)", fontSize: 13 },
  btn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  btnText: { color: "#fbf1ec", fontWeight: "700", fontSize: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.lg },
  heading: { ...type.h2, textAlign: "center" },
  body: { ...type.body, textAlign: "center" },
});
