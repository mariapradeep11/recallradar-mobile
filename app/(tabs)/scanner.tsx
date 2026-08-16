import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../src/context/ThemeContext";
import { radius, spacing } from "../../src/theme";
import { lookupBarcode } from "../../src/lib/barcodeEnrichment";

export default function ScannerScreen() {
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [productLabel, setProductLabel] = useState("");
  const router = useRouter();

  const handleBarcode = async ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEnriching(true);
    setProductLabel("");

    const product = await lookupBarcode(data);

    setEnriching(false);

    if (product.found) {
      // Show the product name briefly before navigating
      setProductLabel(product.brand ? `${product.brand} — ${product.name}` : product.name);
    }

    router.push({
      pathname: "/",
      params: {
        q:             product.searchTerm,
        upc:           data,
        product_name:  product.name,
        product_brand: product.brand,
        product_found: product.found ? "1" : "0",
      },
    });
  };

  if (!permission) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
        <View style={styles.center}>
          <Text style={[styles.body, { color: colors.textSoft }]}>Requesting camera permission…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
        <View style={styles.center}>
          <Text style={[styles.heading, { color: colors.text }]}>Camera access needed</Text>
          <Text style={[styles.body, { color: colors.textSoft }]}>RecallRadar uses your camera to read product barcodes.</Text>
          <Pressable style={[styles.btn, { backgroundColor: colors.accent }]} onPress={requestPermission}>
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

      <View style={styles.overlay}>
        <SafeAreaView style={styles.topBar}>
          <Text style={styles.logo}>
            RECALL<Text style={{ color: colors.accent }}>RADAR</Text>
          </Text>
          <Text style={styles.hint}>Point at a product barcode</Text>
        </SafeAreaView>

        <View style={styles.frameContainer}>
          <View style={styles.frame}>
            <View style={[styles.corner, styles.cornerTL, { borderColor: colors.accent }]} />
            <View style={[styles.corner, styles.cornerTR, { borderColor: colors.accent }]} />
            <View style={[styles.corner, styles.cornerBL, { borderColor: colors.accent }]} />
            <View style={[styles.corner, styles.cornerBR, { borderColor: colors.accent }]} />
          </View>
        </View>

        {scanned && (
          <SafeAreaView edges={["bottom"]} style={styles.bottomBar}>
            {enriching ? (
              <View style={styles.enrichingRow}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.scannedLabel}>Identifying product…</Text>
              </View>
            ) : productLabel ? (
              <Text style={[styles.productLabel, { color: colors.accent }]} numberOfLines={1}>
                {productLabel}
              </Text>
            ) : (
              <Text style={styles.scannedLabel}>Barcode captured — loading results…</Text>
            )}
            <Pressable
              style={[styles.btn, { backgroundColor: colors.accent }]}
              onPress={() => { setScanned(false); setProductLabel(""); }}
            >
              <Text style={styles.btnText}>Scan again</Text>
            </Pressable>
          </SafeAreaView>
        )}
      </View>
    </View>
  );
}

const FRAME  = 260;
const CORNER = 24;
const BORDER = 3;

const styles = StyleSheet.create({
  safe:            { flex: 1 },
  container:       { flex: 1, backgroundColor: "#000" },
  overlay:         { ...StyleSheet.absoluteFillObject, justifyContent: "space-between" },
  topBar:          { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, alignItems: "center", gap: spacing.sm },
  logo:            { fontWeight: "200", fontSize: 16, letterSpacing: 4, color: "#fff" },
  hint:            { color: "rgba(255,255,255,0.55)", fontSize: 13, letterSpacing: 0.3 },
  frameContainer:  { flex: 1, alignItems: "center", justifyContent: "center" },
  frame:           { width: FRAME, height: FRAME, position: "relative" },
  corner:          { position: "absolute", width: CORNER, height: CORNER, borderWidth: BORDER },
  cornerTL:        { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR:        { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL:        { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR:        { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  bottomBar:       { padding: spacing.xl, alignItems: "center", gap: spacing.md },
  enrichingRow:    { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  scannedLabel:    { color: "rgba(255,255,255,0.7)", fontSize: 13 },
  productLabel:    { fontSize: 13, fontWeight: "600", maxWidth: 280, textAlign: "center" },
  btn:             { paddingHorizontal: spacing.xxl, paddingVertical: spacing.md, borderRadius: radius.pill },
  btnText:         { color: "#fbf1ec", fontWeight: "700", fontSize: 14 },
  center:          { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.lg },
  heading:         { fontSize: 20, fontWeight: "700", letterSpacing: -0.2, textAlign: "center" },
  body:            { fontSize: 14, lineHeight: 20, textAlign: "center" },
});
