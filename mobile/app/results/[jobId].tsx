import { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import Spinner from "@/components/Spinner";
import ProteinViewer from "@/components/ProteinViewer";
import { getResults, getDownloadUrl } from "@/lib/api";
import { maybeRequestReview } from "@/lib/rateApp";

interface Pose {
  model: number;
  affinity: number;
}

export default function Results() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const router = useRouter();

  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    getResults(jobId)
      .then((data) => {
        setResults(data);
        // The user just reached completed docking results — a genuine
        // win. Ask for a review once the results UI has settled.
        setTimeout(() => {
          maybeRequestReview();
        }, 1800);
      })
      .catch((e) =>
        setError(e.response?.data?.detail || "Could not load results.")
      )
      .finally(() => setLoading(false));
  }, [jobId]);

  const handleDownload = async (format: "pdb" | "pdbqt") => {
    if (!jobId) return;
    await WebBrowser.openBrowserAsync(getDownloadUrl(jobId, format));
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.center}>
          <Spinner />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.center}>
          <Text style={styles.heading}>Results</Text>
          <Text style={styles.error}>{error}</Text>
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/dashboard",
                params: { jobId },
              })
            }
          >
            <Text style={styles.link}>Back to Dashboard</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!results) return null;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Results</Text>
        <Text style={styles.sub}>
          {results.protein_pdb_id?.toUpperCase()} + {results.ligand_name}
        </Text>

        {/* 3D viewer with docked ligand */}
        <View style={{ marginBottom: 16 }}>
          <ProteinViewer
            pdbId={results.protein_pdb_id}
            ligandPdb={results.docked_pdb}
            height={380}
          />
          <Text style={styles.viewerHint}>
            Protein (rainbow) + docked ligand (green)
          </Text>
        </View>

        {/* Best affinity */}
        <View style={styles.affinityCard}>
          <Text style={styles.affinityNum}>
            {results.best_affinity} kcal/mol
          </Text>
          <Text style={styles.affinityLabel}>Best binding affinity</Text>
        </View>

        {/* Poses table */}
        {results.poses?.length > 0 && (
          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={styles.tableHeaderText}>Pose</Text>
              <Text style={styles.tableHeaderText}>Affinity (kcal/mol)</Text>
            </View>
            {results.poses.map((pose: Pose, i: number) => (
              <View key={pose.model} style={styles.tableRow}>
                <View style={styles.poseLabel}>
                  <Text style={[styles.cellText, { fontFamily: "monospace" }]}>
                    Model {pose.model}
                  </Text>
                  {i === 0 && (
                    <View style={styles.bestBadge}>
                      <Text style={styles.bestText}>BEST</Text>
                    </View>
                  )}
                </View>
                <Text
                  style={[styles.cellText, i === 0 && { color: "#4ade80" }]}
                >
                  {pose.affinity}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Downloads */}
        <View style={styles.downloadRow}>
          <Pressable
            style={styles.downloadPrimary}
            onPress={() => handleDownload("pdb")}
          >
            <Text style={styles.downloadPrimaryText}>Download PDB</Text>
          </Pressable>
          <Pressable
            style={styles.downloadSecondary}
            onPress={() => handleDownload("pdbqt")}
          >
            <Text style={styles.downloadSecondaryText}>Download PDBQT</Text>
          </Pressable>
        </View>

        {/* Nav links */}
        <View style={styles.navRow}>
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/dashboard",
                params: { jobId },
              })
            }
          >
            <Text style={styles.link}>Dashboard</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/docking/protein")}>
            <Text style={styles.link}>New Docking</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 32,
    maxWidth: 700,
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
    marginBottom: 20,
  },
  viewerHint: {
    color: "#4b5563",
    fontSize: 10,
    textAlign: "center",
    marginTop: 6,
  },
  affinityCard: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginBottom: 12,
  },
  affinityNum: {
    fontSize: 28,
    fontWeight: "300",
    color: "#4ade80",
  },
  affinityLabel: {
    fontSize: 10,
    color: "#6b7280",
    marginTop: 4,
  },
  tableCard: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  tableHeaderText: {
    color: "#6b7280",
    fontSize: 11,
  },
  tableRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  poseLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cellText: {
    color: "#fff",
    fontSize: 12,
  },
  bestBadge: {
    backgroundColor: "rgba(74,222,128,0.2)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  bestText: {
    color: "#4ade80",
    fontSize: 9,
    fontWeight: "600",
  },
  downloadRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
  downloadPrimary: {
    flex: 1,
    backgroundColor: "#fff",
    paddingVertical: 12,
    borderRadius: 50,
    alignItems: "center",
  },
  downloadPrimaryText: {
    color: "#000",
    fontSize: 12,
    fontWeight: "500",
  },
  downloadSecondary: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingVertical: 12,
    borderRadius: 50,
    alignItems: "center",
  },
  downloadSecondaryText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "500",
  },
  navRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
  },
  link: {
    color: "#6b7280",
    fontSize: 12,
  },
  error: {
    color: "#f87171",
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
  },
});
