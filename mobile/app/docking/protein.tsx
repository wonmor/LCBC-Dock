import { useState, useRef } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import StepIndicator from "@/components/StepIndicator";
import Spinner from "@/components/Spinner";
import ProteinViewer from "@/components/ProteinViewer";
import { BarButton, BottomBar, BoxedInput, GlyphTile, Message, ScreenHeading, TextLink } from "@/components/Bauhaus";
import { searchProteins } from "@/lib/api";
import { palette, type, space, rule, fonts, maxContent } from "@/lib/theme";

export default function Protein() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInput = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (value.trim().length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const ids = await searchProteins(value);
        if (ids.length === 0) setError("No proteins found. Try a PDB ID like 4HG7.");
        setResults(ids);
      } catch {
        setError("Search failed. Please try again.");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeading
          eyebrow="Step 1 of 4"
          title={selected ? selected.toUpperCase() : "Choose a protein"}
          subtitle={selected ? "From the RCSB Protein Data Bank" : "Search more than 200,000 structures in the RCSB Protein Data Bank"}
        />

        {!selected && (
          <View style={{ gap: 12 }}>
            <BoxedInput
              icon="search"
              value={query}
              onChangeText={handleInput}
              placeholder="Name or PDB ID, e.g. 4HG7"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {loading && <Spinner label="Searching RCSB PDB..." />}
            {error && !loading && <Message kind="error" text={error} />}
            {results.length > 0 && !loading && (
              <View style={styles.list}>
                {results.map((pdbId, i) => (
                  <Pressable
                    key={pdbId}
                    style={({ pressed }) => [styles.listItem, i > 0 && styles.listRule, pressed && { backgroundColor: palette.groundSoft }]}
                    onPress={() => setSelected(pdbId)}
                    accessibilityRole="button"
                    accessibilityLabel={`PDB ${pdbId}`}
                  >
                    <GlyphTile icon="cube-outline" fill={palette.ground} size={32} />
                    <Text style={styles.listText}>{pdbId}</Text>
                    <Ionicons name="chevron-forward" size={20} color={palette.ink} />
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        {selected && (
          <View style={{ gap: 12 }}>
            <ProteinViewer pdbId={selected} height={360} />
            <TextLink
              title="Search again"
              icon="search"
              onPress={() => {
                setSelected(null);
                setQuery("");
                setResults([]);
              }}
            />
          </View>
        )}
      </ScrollView>

      <BottomBar>
        <StepIndicator current={0} />
        {selected && (
          <BarButton
            title="Next"
            icon="arrow-forward"
            kind="action"
            style={{ flex: 1, maxWidth: 180 }}
            onPress={() => router.push({ pathname: "/docking/marinate", params: { proteinState: selected } })}
          />
        )}
      </BottomBar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.ground },
  content: { padding: space.m, paddingBottom: space.xl, maxWidth: maxContent, alignSelf: "center", width: "100%" },
  list: { borderWidth: rule.regular, borderColor: palette.ink },
  listItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
  listRule: { borderTopWidth: rule.thin, borderTopColor: palette.ink },
  listText: { flex: 1, fontFamily: fonts.semibold, fontSize: 18, letterSpacing: 1.5, color: palette.ink },
});
