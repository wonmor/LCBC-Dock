import { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import StepIndicator from "@/components/StepIndicator";
import Spinner from "@/components/Spinner";
import { searchMolecules, getMoleculeImageUrl, type Molecule } from "@/lib/api";

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
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>
          {selected ? selected.name : "Ligand"}
        </Text>
        <Text style={styles.sub}>
          {selected
            ? `CID ${selected.cid} · ${selected.formula}`
            : "Search PubChem — 100M+ compounds"}
        </Text>

        {!selected && (
          <>
            <TextInput
              style={styles.input}
              value={query}
              onChangeText={handleInput}
              placeholder="Search by name (e.g. aspirin, caffeine)"
              placeholderTextColor="#4b5563"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {loading && <Spinner label="Searching PubChem..." />}
            {error && !loading && <Text style={styles.error}>{error}</Text>}
            {results.length > 0 && !loading && (
              <View style={styles.list}>
                {results.map((mol) => (
                  <Pressable
                    key={mol.cid}
                    style={styles.listItem}
                    onPress={() => setSelected(mol)}
                  >
                    <Text style={styles.molName}>{mol.name}</Text>
                    <Text style={styles.molMeta}>
                      CID {mol.cid} · {mol.formula} · {mol.weight.toFixed(1)} g/mol
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}

        {selected && (
          <>
            <View style={styles.imageCard}>
              <Image
                source={{ uri: getMoleculeImageUrl(selected.cid) }}
                style={styles.molImage}
                resizeMode="contain"
              />
            </View>

            <View style={styles.detailCard}>
              <View style={styles.detailRow}>
                <View style={styles.detailCol}>
                  <Text style={styles.detailLabel}>PubChem CID</Text>
                  <Text style={styles.detailValue}>{selected.cid}</Text>
                </View>
                <View style={styles.detailCol}>
                  <Text style={styles.detailLabel}>Formula</Text>
                  <Text style={styles.detailValue}>{selected.formula}</Text>
                </View>
              </View>
              <View style={styles.detailCol}>
                <Text style={styles.detailLabel}>Weight</Text>
                <Text style={styles.detailValue}>
                  {selected.weight.toFixed(2)} g/mol
                </Text>
              </View>
              {selected.smiles ? (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.detailLabel}>SMILES</Text>
                  <View style={styles.smilesBox}>
                    <Text style={styles.smilesText}>{selected.smiles}</Text>
                  </View>
                </View>
              ) : null}
            </View>

            <Pressable
              onPress={() => {
                setSelected(null);
                setQuery("");
                setResults([]);
              }}
            >
              <Text style={styles.searchAgain}>Search again</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      <View style={styles.bottomBar}>
        <StepIndicator current={2} />
        <View style={styles.actions}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          {selected && proteinState && (
            <Pressable
              style={styles.nextBtn}
              onPress={() =>
                router.push({
                  pathname: "/docking/cook",
                  params: {
                    proteinState,
                    ligandCid: String(selected.cid),
                    ligandName: selected.name,
                  },
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
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
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
    marginBottom: 24,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    color: "#fff",
  },
  error: {
    color: "#f87171",
    fontSize: 12,
    textAlign: "center",
    marginTop: 12,
  },
  list: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    overflow: "hidden",
  },
  listItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  molName: {
    color: "#fff",
    fontSize: 14,
  },
  molMeta: {
    color: "#6b7280",
    fontSize: 11,
    marginTop: 2,
  },
  imageCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  molImage: {
    width: 260,
    height: 260,
  },
  detailCard: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 12,
  },
  detailCol: {
    flex: 1,
  },
  detailLabel: {
    color: "#6b7280",
    fontSize: 11,
  },
  detailValue: {
    color: "#fff",
    fontSize: 14,
    marginTop: 2,
  },
  smilesBox: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 8,
    padding: 8,
    marginTop: 4,
  },
  smilesText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "monospace",
  },
  searchAgain: {
    color: "#6b7280",
    fontSize: 12,
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
