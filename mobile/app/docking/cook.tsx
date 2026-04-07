import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Slider from "@react-native-community/slider";
import StepIndicator from "@/components/StepIndicator";
import { submitDockingJob } from "@/lib/api";

export default function Cook() {
  const router = useRouter();
  const { proteinState, ligandCid, ligandName } = useLocalSearchParams<{
    proteinState: string;
    ligandCid: string;
    ligandName: string;
  }>();

  const [email, setEmail] = useState("");
  const [exhaustiveness, setExhaustiveness] = useState(4);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!proteinState || !ligandCid) return;
    setSubmitting(true);
    setError(null);

    try {
      const data = await submitDockingJob({
        protein_pdb_id: proteinState,
        ligand_cid: parseInt(ligandCid),
        ligand_name: ligandName ?? "",
        exhaustiveness,
        email: email || undefined,
      });
      router.replace({
        pathname: "/dashboard",
        params: { jobId: data.job_id },
      });
    } catch (err: any) {
      setError(
        err.response?.data?.detail || "Failed to submit. Is the backend running?"
      );
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>Dock</Text>
        <Text style={styles.sub}>
          {(proteinState ?? "").toUpperCase()} + {ligandName}
        </Text>

        {/* Summary */}
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Protein</Text>
              <Text style={styles.value}>{(proteinState ?? "").toUpperCase()}</Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Ligand</Text>
              <Text style={styles.value}>{ligandName}</Text>
            </View>
          </View>
        </View>

        {/* Exhaustiveness */}
        <View style={styles.card}>
          <Text style={styles.label}>Exhaustiveness (1–32)</Text>
          <Slider
            style={{ marginTop: 8 }}
            minimumValue={1}
            maximumValue={32}
            step={1}
            value={exhaustiveness}
            onValueChange={setExhaustiveness}
            minimumTrackTintColor="#fff"
            maximumTrackTintColor="rgba(255,255,255,0.1)"
            thumbTintColor="#fff"
          />
          <Text style={styles.sliderValue}>{exhaustiveness}</Text>
        </View>

        {/* Email */}
        <View style={styles.card}>
          <Text style={styles.label}>Email (optional)</Text>
          <TextInput
            style={styles.emailInput}
            value={email}
            onChangeText={setEmail}
            placeholder="Notify me when done"
            placeholderTextColor="#4b5563"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.submitBtn, (submitting || !proteinState || !ligandCid) && styles.disabled]}
          onPress={handleSubmit}
          disabled={submitting || !proteinState || !ligandCid}
        >
          <Text style={styles.submitText}>
            {submitting ? "Submitting..." : "Start Docking"}
          </Text>
        </Pressable>

        <Text style={styles.footnote}>
          Grid center auto-computed from protein. Powered by AutoDock Vina.
        </Text>
      </ScrollView>

      <View style={styles.bottomBar}>
        <StepIndicator current={3} />
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 12,
  },
  heading: {
    fontSize: 32,
    fontWeight: "200",
    color: "#fff",
    textAlign: "center",
    marginBottom: 4,
  },
  sub: {
    fontSize: 11,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 20,
  },
  card: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    padding: 20,
  },
  row: {
    flexDirection: "row",
    gap: 16,
  },
  col: { flex: 1 },
  label: {
    color: "#6b7280",
    fontSize: 11,
  },
  value: {
    color: "#fff",
    fontSize: 14,
    marginTop: 2,
  },
  sliderValue: {
    color: "#9ca3af",
    fontSize: 12,
    textAlign: "right",
    marginTop: 4,
  },
  emailInput: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
    paddingVertical: 10,
    fontSize: 14,
    color: "#fff",
    marginTop: 4,
  },
  error: {
    color: "#f87171",
    fontSize: 12,
    textAlign: "center",
  },
  submitBtn: {
    backgroundColor: "#fff",
    paddingVertical: 14,
    borderRadius: 50,
    alignItems: "center",
  },
  disabled: {
    opacity: 0.3,
  },
  submitText: {
    color: "#000",
    fontSize: 14,
    fontWeight: "500",
  },
  footnote: {
    color: "#4b5563",
    fontSize: 10,
    textAlign: "center",
  },
  bottomBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  backText: {
    color: "#6b7280",
    fontSize: 12,
  },
});
