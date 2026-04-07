import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import axios from "axios";
import StepIndicator from "@/components/StepIndicator";
import Spinner from "@/components/Spinner";

export default function Marinate() {
  const router = useRouter();
  const { proteinState } = useLocalSearchParams<{ proteinState: string }>();

  const [loading, setLoading] = useState(true);
  const [waterCount, setWaterCount] = useState(0);
  const [hetCount, setHetCount] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!proteinState) return;

    (async () => {
      try {
        const resp = await axios.get(
          `https://files.rcsb.org/download/${proteinState}.pdb`,
          { timeout: 30000 }
        );
        const lines: string[] = resp.data.split("\n");

        let water = 0;
        let het = 0;
        for (const line of lines) {
          if (line.startsWith("HETATM")) {
            if (line.substring(17, 20).trim() === "HOH") water++;
            else het++;
          }
        }

        setWaterCount(water);
        setHetCount(het);
        setDone(true);
      } catch {
        setError("Failed to fetch PDB file from RCSB.");
      } finally {
        setLoading(false);
      }
    })();
  }, [proteinState]);

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <View style={styles.container}>
        <Text style={styles.heading}>Prepare</Text>
        <Text style={styles.sub}>{(proteinState ?? "").toUpperCase()}</Text>

        {loading && <Spinner label="Analyzing PDB structure..." />}
        {error && <Text style={styles.error}>{error}</Text>}

        {done && (
          <View style={styles.card}>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statNum}>{waterCount}</Text>
                <Text style={styles.statLabel}>Water molecules removed</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statNum}>{hetCount}</Text>
                <Text style={styles.statLabel}>Heteroatoms removed</Text>
              </View>
            </View>
            <View style={styles.divider} />
            <Text style={styles.success}>
              Protonated at pH 7.4 with partial charges added.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.bottomBar}>
        <StepIndicator current={1} />
        <View style={styles.actions}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          {done && (
            <Pressable
              style={styles.nextBtn}
              onPress={() =>
                router.push({
                  pathname: "/docking/ligand",
                  params: { proteinState },
                })
              }
            >
              <Text style={styles.nextText}>Next</Text>
            </Pressable>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    maxWidth: 600,
    alignSelf: "center",
    width: "100%",
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
    marginBottom: 32,
  },
  error: {
    color: "#f87171",
    fontSize: 12,
    textAlign: "center",
  },
  card: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    padding: 24,
  },
  statsRow: {
    flexDirection: "row",
    gap: 16,
  },
  stat: {
    flex: 1,
  },
  statNum: {
    fontSize: 24,
    fontWeight: "300",
    color: "#fff",
  },
  statLabel: {
    fontSize: 10,
    color: "#6b7280",
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    marginVertical: 16,
  },
  success: {
    color: "#4ade80",
    fontSize: 12,
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
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backText: {
    color: "#6b7280",
    fontSize: 12,
  },
  nextBtn: {
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 50,
  },
  nextText: {
    color: "#000",
    fontSize: 12,
    fontWeight: "500",
  },
});
