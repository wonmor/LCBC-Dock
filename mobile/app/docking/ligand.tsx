import { useState, useRef } from "react";
import { View, Text, Pressable, Image, ScrollView, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import StepIndicator from "@/components/StepIndicator";
import Spinner from "@/components/Spinner";
import { BarButton, BottomBar, BoxedInput, IconButton, KeyValue, Message, Panel, ScreenHeading, TextLink } from "@/components/Bauhaus";
import { searchMolecules, getMoleculeImageUrl, type Molecule } from "@/lib/api";
import { palette, type, space, rule, fonts, maxContent } from "@/lib/theme";

export default function Ligand() {
  const router = useRouter();
  const { proteinState } = useLocalSearchParams<{ proteinState: string }>();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Molecule[]>([]);
  const [selected, setSelected] = useState<Molecule | null>(null);
  const [loading, setLoading] = useState(false);
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
        const data = await searchMolecules(value);
        if (data.length === 0)
          setError("No molecules found. Try the full name (e.g. aspirin, caffeine).");
        setResults(data);
      } catch {
        setError("Search failed. Please try again.");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 500);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeading
          eyebrow="Step 3 of 4"
          title={selected ? selected.name : "Choose a ligand"}
          subtitle={selected ? `CID ${selected.cid} | ${selected.formula}` : "Search PubChem, more than 100 million compounds"}
        />

        {!selected && (
          <View style={{ gap: 12 }}>
            <BoxedInput
              icon="search"
              value={query}
              onChangeText={handleInput}
              placeholder="Name, e.g. aspirin or caffeine"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {loading && <Spinner label="Searching PubChem..." />}
            {error && !loading && <Message kind="error" text={error} />}
            {results.length > 0 && !loading && (
              <View style={styles.list}>
                {results.map((mol, i) => (
                  <Pressable
                    key={mol.cid}
                    style={({ pressed }) => [styles.listItem, i > 0 && styles.listRule, pressed && { backgroundColor: palette.groundSoft }]}
                    onPress={() => setSelected(mol)}
                    accessibilityRole="button"
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={type.bodyBold}>{mol.name}</Text>
                      <Text style={type.caption}>
                        CID {mol.cid} | {mol.formula} | {mol.weight.toFixed(1)} g/mol
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={palette.ink} />
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        {selected && (
          <View style={{ gap: 12 }}>
            <View style={styles.imageCard}>
              <Image source={{ uri: getMoleculeImageUrl(selected.cid) }} style={styles.molImage} resizeMode="contain" />
            </View>

            <Panel style={{ paddingVertical: 4 }}>
              <KeyValue label="PubChem CID" value={String(selected.cid)} />
              <KeyValue label="Formula" value={selected.formula} />
              <KeyValue label="Weight" value={`${selected.weight.toFixed(2)} g/mol`} last={!selected.smiles} />
              {selected.smiles ? (
                <View style={{ paddingVertical: 10, gap: 6 }}>
                  <Text style={type.label}>SMILES</Text>
                  <View style={styles.smilesBox}>
                    <Text style={type.mono} selectable>
                      {selected.smiles}
                    </Text>
                  </View>
                </View>
              ) : null}
            </Panel>

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
        <StepIndicator current={2} />
        <View style={styles.actions}>
          <IconButton icon="arrow-back" label="Back" onPress={() => router.back()} />
          {selected && proteinState && (
            <BarButton
              title="Next"
              icon="arrow-forward"
              kind="action"
              style={{ flex: 1 }}
              onPress={() =>
                router.push({
                  pathname: "/docking/cook",
                  params: { proteinState, ligandCid: String(selected.cid), ligandName: selected.name },
                })
              }
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
  list: { borderWidth: rule.regular, borderColor: palette.ink },
  listItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 12 },
  listRule: { borderTopWidth: rule.thin, borderTopColor: palette.ink },
  imageCard: { borderWidth: rule.regular, borderColor: palette.ink, backgroundColor: palette.ground, padding: space.m, alignItems: "center" },
  molImage: { width: 240, height: 240 },
  smilesBox: { backgroundColor: palette.groundSoft, padding: space.s, borderWidth: rule.thin, borderColor: palette.ink },
  actions: { flexDirection: "row", gap: space.s, flex: 1, maxWidth: 240, justifyContent: "flex-end" },
});
