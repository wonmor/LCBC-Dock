import { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import Spinner from "@/components/Spinner";
import ProteinViewer from "@/components/ProteinViewer";
import { BarButton, Message, ScreenHeading, SectionTitle, TextLink } from "@/components/Bauhaus";
import { getResults, getDownloadUrl } from "@/lib/api";
import { maybeRequestReview } from "@/lib/rateApp";
import { palette, type, space, rule, fonts, maxContent } from "@/lib/theme";

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
      <SafeAreaView style={[styles.safe, styles.center]} edges={["bottom"]}>
        <Spinner label="Loading results..." />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom", "left", "right"]}>
        <View style={styles.content}>
          <ScreenHeading title="Results" />
          <Message kind="error" text={error} />
          <TextLink title="Back to dashboard" icon="arrow-back" onPress={() => router.push({ pathname: "/dashboard", params: { jobId } })} />
        </View>
      </SafeAreaView>
    );
  }

  if (!results) return null;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeading
          eyebrow="Docking results"
          title={`${results.protein_pdb_id?.toUpperCase()} + ${results.ligand_name}`}
        />

        {/* Best affinity */}
        <View style={styles.affinity}>
          <View style={styles.affinityFill}>
            <Text style={[type.label, { color: palette.ground }]}>Best binding affinity</Text>
            <Text style={styles.affinityNum} numberOfLines={1} adjustsFontSizeToFit>
              {results.best_affinity}
            </Text>
          </View>
          <View style={styles.affinityUnit}>
            <Text style={styles.unit}>kcal</Text>
            <Text style={styles.unit}>/mol</Text>
          </View>
        </View>

        {/* 3D viewer with docked ligand */}
        <View style={{ marginBottom: space.l }}>
          <ProteinViewer pdbId={results.protein_pdb_id} ligandPdb={results.docked_pdb} height={380} />
          <Text style={[type.caption, { textAlign: "center", marginTop: 6 }]}>
            Protein in rainbow cartoon, docked ligand in green
          </Text>
        </View>

        {/* Poses table */}
        {results.poses?.length > 0 && (
          <View style={{ marginBottom: space.l }}>
            <SectionTitle title="Poses" accessory={<Text style={type.label}>kcal/mol</Text>} />
            <View style={styles.table}>
              {results.poses.map((pose: Pose, i: number) => (
                <View key={pose.model} style={[styles.tableRow, i > 0 && styles.tableRule]}>
                  <Text style={styles.cell}>Model {pose.model}</Text>
                  {i === 0 && (
                    <View style={styles.bestBadge}>
                      <Text style={styles.bestText}>BEST</Text>
                    </View>
                  )}
                  <Text style={[styles.cellNum, i === 0 && { fontFamily: fonts.bold }]}>{pose.affinity}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Downloads */}
        <SectionTitle title="Download" />
        <View style={styles.downloadRow}>
          <BarButton title="PDB" icon="download-outline" kind="action" style={{ flex: 1 }} onPress={() => handleDownload("pdb")} />
          <BarButton title="PDBQT" icon="download-outline" kind="secondary" style={{ flex: 1 }} onPress={() => handleDownload("pdbqt")} />
        </View>

        <View style={styles.navRow}>
          <TextLink title="Dashboard" icon="pulse" onPress={() => router.push({ pathname: "/dashboard", params: { jobId } })} />
          <TextLink title="New docking" icon="add" onPress={() => router.push("/docking/protein")} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.ground },
  center: { alignItems: "center", justifyContent: "center" },
  content: { padding: space.m, paddingBottom: space.xl, maxWidth: maxContent + 40, alignSelf: "center", width: "100%" },
  affinity: { flexDirection: "row", borderWidth: rule.regular, borderColor: palette.ink, marginBottom: space.m },
  affinityFill: { flex: 1, backgroundColor: palette.blue, padding: 12 },
  affinityNum: { fontFamily: fonts.bold, fontSize: 44, lineHeight: 50, color: palette.ground },
  affinityUnit: {
    justifyContent: "center",
    paddingHorizontal: space.m,
    borderLeftWidth: rule.regular,
    borderLeftColor: palette.ink,
    backgroundColor: palette.ground,
  },
  unit: { fontFamily: fonts.semibold, fontSize: 18, color: palette.ink },
  table: { borderWidth: rule.regular, borderColor: palette.ink },
  tableRow: { flexDirection: "row", alignItems: "center", gap: space.s, paddingHorizontal: 12, minHeight: 44 },
  tableRule: { borderTopWidth: rule.thin, borderTopColor: palette.ink },
  cell: { fontFamily: fonts.medium, fontSize: 15, color: palette.ink },
  cellNum: { flex: 1, textAlign: "right", fontFamily: fonts.medium, fontSize: 16, color: palette.ink },
  bestBadge: { backgroundColor: palette.yellow, borderWidth: rule.regular, borderColor: palette.ink, paddingHorizontal: 6, paddingVertical: 1 },
  bestText: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1, color: palette.ink },
  downloadRow: { flexDirection: "row", gap: space.s, marginBottom: space.l },
  navRow: { flexDirection: "row", justifyContent: "center", gap: space.l },
});
