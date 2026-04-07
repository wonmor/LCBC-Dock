import { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Image,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { getStats, getMoleculeImageUrl, type Stats } from "@/lib/api";
import { useIsWide } from "@/lib/useLayout";

interface Example {
  protein: string;
  proteinName: string;
  ligandCid: number;
  ligandName: string;
  category: string;
  description: string;
}

const EXAMPLES: Example[] = [
  { protein: "1IEP", proteinName: "BCR-ABL Kinase", ligandCid: 5291, ligandName: "Imatinib", category: "Cancer", description: "First targeted tyrosine kinase inhibitor for CML." },
  { protein: "4HG7", proteinName: "MDM2", ligandCid: 11433190, ligandName: "Nutlin-3a", category: "Cancer", description: "Reactivates p53 tumor suppressor." },
  { protein: "5IKR", proteinName: "COX-2", ligandCid: 2244, ligandName: "Aspirin", category: "Pain & Inflammation", description: "World's most widely used drug." },
  { protein: "3RFM", proteinName: "Adenosine A2A Receptor", ligandCid: 2519, ligandName: "Caffeine", category: "Neuroscience", description: "Blocks adenosine receptors." },
  { protein: "1UDT", proteinName: "PDE5", ligandCid: 5212, ligandName: "Sildenafil", category: "Cardiovascular", description: "PDE5 inhibitor, famously repurposed." },
  { protein: "2HT8", proteinName: "Neuraminidase", ligandCid: 65028, ligandName: "Oseltamivir", category: "Antiviral", description: "Tamiflu — influenza antiviral." },
  { protein: "7BV2", proteinName: "RNA-dependent RNA Polymerase", ligandCid: 121304016, ligandName: "Remdesivir", category: "Antiviral", description: "COVID-19 RNA replication terminator." },
  { protein: "1MUI", proteinName: "HIV-1 Protease", ligandCid: 92727, ligandName: "Lopinavir", category: "Antiviral", description: "HIV protease inhibitor." },
  { protein: "1JFF", proteinName: "Tubulin", ligandCid: 36314, ligandName: "Paclitaxel", category: "Cancer", description: "Taxol — stabilizes microtubules." },
  { protein: "4CFF", proteinName: "AMPK", ligandCid: 4091, ligandName: "Metformin", category: "Metabolic", description: "Most prescribed diabetes drug." },
  { protein: "3ERT", proteinName: "Estrogen Receptor \u03b1", ligandCid: 2733526, ligandName: "Tamoxifen", category: "Cancer", description: "Breast cancer SERM." },
  { protein: "2RG6", proteinName: "Acetylcholinesterase", ligandCid: 3152, ligandName: "Donepezil", category: "Neuroscience", description: "Aricept — Alzheimer's treatment." },
  { protein: "3NYA", proteinName: "EGFR Kinase", ligandCid: 176870, ligandName: "Erlotinib", category: "Cancer", description: "EGFR inhibitor for lung cancer." },
  { protein: "3OGP", proteinName: "HMG-CoA Reductase", ligandCid: 60823, ligandName: "Atorvastatin", category: "Cardiovascular", description: "Lipitor — best-selling drug ever." },
  { protein: "2ITO", proteinName: "Dihydrofolate Reductase", ligandCid: 126941, ligandName: "Methotrexate", category: "Cancer", description: "Antimetabolite chemotherapy." },
  { protein: "1PWC", proteinName: "Penicillin-Binding Protein", ligandCid: 5904, ligandName: "Penicillin G", category: "Antibiotic", description: "Started the antibiotic revolution." },
];

const CATEGORIES = ["All", ...Array.from(new Set(EXAMPLES.map((e) => e.category)))];

export default function Home() {
  const router = useRouter();
  const isWide = useIsWide();
  const [stats, setStats] = useState<Stats | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  useEffect(() => {
    getStats().then(setStats).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    return EXAMPLES.filter((ex) => {
      const matchCat = category === "All" || ex.category === category;
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        ex.ligandName.toLowerCase().includes(q) ||
        ex.proteinName.toLowerCase().includes(q) ||
        ex.protein.toLowerCase().includes(q) ||
        ex.category.toLowerCase().includes(q) ||
        ex.description.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [search, category]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero */}
        <Text style={styles.title}>
          Dock<Text style={styles.titleBold}>It</Text>
        </Text>
        <Text style={styles.subtitle}>
          Molecular docking on the go.{"\n"}Powered by AutoDock Vina.
        </Text>

        {/* Live stats */}
        {stats && (
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statNum}>{stats.total_jobs}</Text>
              <Text style={styles.statLabel}>Total Jobs</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNum}>{stats.completed_jobs}</Text>
              <Text style={styles.statLabel}>Completed</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statNum, { color: "#facc15" }]}>
                {stats.queue_length + stats.active_jobs}
              </Text>
              <Text style={styles.statLabel}>In Queue</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNum}>
                {stats.est_wait_minutes === 0 ? "<1" : `~${stats.est_wait_minutes}`}
              </Text>
              <Text style={styles.statLabel}>Est. Wait (min)</Text>
            </View>
          </View>
        )}

        {/* Section header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Famous Dockings</Text>
          <Pressable
            style={styles.customBtn}
            onPress={() => router.push("/docking/protein")}
          >
            <Text style={styles.customBtnText}>Custom Docking</Text>
          </Pressable>
        </View>

        {/* Search */}
        <TextInput
          style={styles.input}
          value={search}
          onChangeText={setSearch}
          placeholder="Search examples (e.g. cancer, aspirin...)"
          placeholderTextColor="#4b5563"
          autoCapitalize="none"
          autoCorrect={false}
        />

        {/* Category pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pills}
        >
          {CATEGORIES.map((cat) => (
            <Pressable
              key={cat}
              style={[
                styles.pill,
                category === cat ? styles.pillActive : styles.pillInactive,
              ]}
              onPress={() => setCategory(cat)}
            >
              <Text
                style={[
                  styles.pillText,
                  category === cat ? styles.pillTextActive : styles.pillTextInactive,
                ]}
              >
                {cat}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Example cards */}
        <View style={isWide ? styles.gridWide : undefined}>
        {filtered.map((ex) => (
          <Pressable
            key={`${ex.protein}-${ex.ligandCid}`}
            style={[styles.exCard, isWide && styles.exCardWide]}
            onPress={() =>
              router.push({
                pathname: "/docking/cook",
                params: {
                  proteinState: ex.protein,
                  ligandCid: String(ex.ligandCid),
                  ligandName: ex.ligandName,
                },
              })
            }
          >
            <Image
              source={{ uri: getMoleculeImageUrl(ex.ligandCid) }}
              style={styles.thumb}
              resizeMode="contain"
            />
            <View style={styles.exInfo}>
              <View style={styles.exTitleRow}>
                <Text style={styles.exName}>{ex.ligandName}</Text>
                <View style={styles.catBadge}>
                  <Text style={styles.catText}>{ex.category}</Text>
                </View>
              </View>
              <Text style={styles.exMeta} numberOfLines={1}>
                {ex.protein} · {ex.proteinName}
              </Text>
              <Text style={styles.exDesc} numberOfLines={1}>
                {ex.description}
              </Text>
            </View>
          </Pressable>
        ))}

        </View>

        {filtered.length === 0 && (
          <Text style={styles.empty}>No examples match your search.</Text>
        )}

        {/* Nav links */}
        <View style={styles.navRow}>
          <Pressable onPress={() => router.push("/dashboard")}>
            <Text style={styles.navLink}>Dashboard</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/about")}>
            <Text style={styles.navLink}>About</Text>
          </Pressable>
        </View>

        <Text style={styles.footer}>
          Built by John Seong · Seoul National University
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 32,
    maxWidth: 800,
    alignSelf: "center",
    width: "100%",
  },
  title: {
    fontSize: 48,
    fontWeight: "200",
    color: "#fff",
    letterSpacing: 2,
    textAlign: "center",
    marginBottom: 8,
  },
  titleBold: { fontWeight: "600" },
  subtitle: {
    color: "#9ca3af",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    minWidth: "45%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
  },
  statNum: {
    fontSize: 22,
    fontWeight: "300",
    color: "#fff",
  },
  statLabel: {
    fontSize: 10,
    color: "#6b7280",
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "300",
  },
  customBtn: {
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 50,
  },
  customBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "500",
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
    marginBottom: 10,
  },
  pills: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 12,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 50,
  },
  pillActive: { backgroundColor: "#fff" },
  pillInactive: { backgroundColor: "rgba(255,255,255,0.05)" },
  pillText: { fontSize: 11 },
  pillTextActive: { color: "#000" },
  pillTextInactive: { color: "#9ca3af" },
  exCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  exInfo: { flex: 1 },
  exTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  exName: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
  catBadge: {
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 50,
  },
  catText: { color: "#9ca3af", fontSize: 9 },
  exMeta: { color: "#6b7280", fontSize: 11 },
  exDesc: { color: "#4b5563", fontSize: 11 },
  gridWide: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  exCardWide: {
    width: "48.5%",
  },
  empty: {
    color: "#6b7280",
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 24,
  },
  navRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
    marginTop: 20,
    marginBottom: 12,
  },
  navLink: { color: "#9ca3af", fontSize: 13 },
  footer: {
    color: "#4b5563",
    fontSize: 11,
    textAlign: "center",
  },
});
