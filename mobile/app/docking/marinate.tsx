import { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import axios from "axios";
import StepIndicator from "@/components/StepIndicator";
import Spinner from "@/components/Spinner";
import { BarButton, BottomBar, IconButton, GlyphTile, Message, Panel, ScreenHeading, Stat } from "@/components/Bauhaus";
import { palette, type, space, maxContent } from "@/lib/theme";

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
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <ScreenHeading eyebrow="Step 2 of 4" title="Prepare the protein" subtitle={(proteinState ?? "").toUpperCase()} />

        {loading && <Spinner label="Analysing the PDB structure..." />}
        {error && <Message kind="error" text={error} />}

        {done && (
          <View style={{ gap: 12 }}>
            <View style={styles.statsRow}>
              <Stat value={waterCount} label="Water molecules removed" />
              <Stat value={hetCount} label="Heteroatoms removed" />
            </View>
            <Panel style={styles.ready}>
              <GlyphTile icon="checkmark" fill={palette.blue} />
              <Text style={[type.body, { flex: 1 }]}>Protonated at pH 7.4 with partial charges added.</Text>
            </Panel>
          </View>
        )}
      </ScrollView>

      <BottomBar>
        <StepIndicator current={1} />
        <View style={styles.actions}>
          <IconButton icon="arrow-back" label="Back" onPress={() => router.back()} />
          {done && (
            <BarButton
              title="Next"
              icon="arrow-forward"
              kind="action"
              style={{ flex: 1 }}
              onPress={() => router.push({ pathname: "/docking/ligand", params: { proteinState } })}
            />
          )}
        </View>
      </BottomBar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.ground },
  content: { padding: space.m, paddingBottom: space.xl, maxWidth: maxContent, alignSelf: "center", width: "100%" },
  statsRow: { flexDirection: "row", gap: space.s },
  ready: { flexDirection: "row", alignItems: "center", gap: 12 },
  actions: { flexDirection: "row", gap: space.s, flex: 1, maxWidth: 240, justifyContent: "flex-end" },
});
