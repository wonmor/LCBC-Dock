import { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { WebView } from "react-native-webview";
import { SafeAreaView } from "react-native-safe-area-context";
import StepIndicator from "@/components/StepIndicator";
import Spinner from "@/components/Spinner";
import { searchProteins, getProtein3DViewUrl } from "@/lib/api";

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
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <View style={styles.container}>
        <Text style={styles.heading}>
          {selected ? selected.toUpperCase() : "Protein"}
        </Text>
        <Text style={styles.sub}>
          {selected ? "Selected from RCSB PDB" : "Search the RCSB Protein Data Bank"}
        </Text>

        {!selected && (
          <>
            <TextInput
              style={styles.input}
              value={query}
              onChangeText={handleInput}
              placeholder="Search by name or PDB ID (e.g. 4HG7)"
              placeholderTextColor="#4b5563"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {loading && <Spinner label="Searching RCSB PDB..." />}
            {error && !loading && <Text style={styles.error}>{error}</Text>}
            {results.length > 0 && !loading && (
              <View style={styles.list}>
                {results.map((pdbId) => (
                  <Pressable
                    key={pdbId}
                    style={styles.listItem}
                    onPress={() => setSelected(pdbId)}
                  >
                    <Text style={styles.listText}>{pdbId}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}

        {selected && (
          <View style={styles.viewerWrap}>
            <View style={styles.viewer}>
              <WebView
                source={{ uri: getProtein3DViewUrl(selected) }}
                style={{ flex: 1 }}
                javaScriptEnabled
              />
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
          </View>
        )}
      </View>

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        <StepIndicator current={0} />
        {selected && (
          <Pressable
            style={styles.nextBtn}
            onPress={() =>
              router.push({
                pathname: "/docking/marinate",
                params: { proteinState: selected },
              })
            }
          >
            <Text style={styles.nextText}>Next</Text>
          </Pressable>
        )}
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
  listText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "monospace",
  },
  viewerWrap: {
    flex: 1,
    gap: 12,
  },
  viewer: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
    overflow: "hidden",
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
