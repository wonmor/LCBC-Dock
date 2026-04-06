import { useState, useMemo } from "react";
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
import { getMoleculeImageUrl } from "@/lib/api";

interface Example {
  protein: string;
  proteinName: string;
  ligandCid: number;
  ligandName: string;
  category: string;
  description: string;
}

const EXAMPLES: Example[] = [
  {
    protein: "1IEP",
    proteinName: "BCR-ABL Kinase",
    ligandCid: 5291,
    ligandName: "Imatinib",
    category: "Cancer",
    description:
      "Revolutionary cancer drug for chronic myeloid leukemia. First targeted tyrosine kinase inhibitor.",
  },
  {
    protein: "4HG7",
    proteinName: "MDM2",
    ligandCid: 11433190,
    ligandName: "Nutlin-3a",
    category: "Cancer",
    description:
      "Inhibits p53-MDM2 interaction, reactivating tumor suppressor p53 in cancer cells.",
  },
  {
    protein: "5IKR",
    proteinName: "COX-2",
    ligandCid: 2244,
    ligandName: "Aspirin",
    category: "Pain & Inflammation",
    description:
      "The world's most widely used drug. Inhibits cyclooxygenase to reduce pain and inflammation.",
  },
  {
    protein: "3RFM",
    proteinName: "Adenosine A2A Receptor",
    ligandCid: 2519,
    ligandName: "Caffeine",
    category: "Neuroscience",
    description:
      "Blocks adenosine receptors in the brain, preventing drowsiness and promoting alertness.",
  },
  {
    protein: "1UDT",
    proteinName: "PDE5",
    ligandCid: 5212,
    ligandName: "Sildenafil",
    category: "Cardiovascular",
    description:
      "Inhibits phosphodiesterase type 5. Originally developed for hypertension, famously repurposed.",
  },
  {
    protein: "2HT8",
    proteinName: "Neuraminidase",
    ligandCid: 65028,
    ligandName: "Oseltamivir",
    category: "Antiviral",
    description:
      "Tamiflu — the frontline antiviral for influenza. Blocks viral release from host cells.",
  },
  {
    protein: "7BV2",
    proteinName: "RNA-dependent RNA Polymerase",
    ligandCid: 121304016,
    ligandName: "Remdesivir",
    category: "Antiviral",
    description:
      "Developed for COVID-19. Mimics adenosine and terminates viral RNA replication.",
  },
  {
    protein: "1MUI",
    proteinName: "HIV-1 Protease",
    ligandCid: 92727,
    ligandName: "Lopinavir",
    category: "Antiviral",
    description:
      "HIV protease inhibitor used in combination antiretroviral therapy for AIDS treatment.",
  },
  {
    protein: "1JFF",
    proteinName: "Tubulin",
    ligandCid: 36314,
    ligandName: "Paclitaxel",
    category: "Cancer",
    description:
      "Taxol — derived from Pacific yew tree bark. Stabilizes microtubules to halt cancer cell division.",
  },
  {
    protein: "4CFF",
    proteinName: "AMPK",
    ligandCid: 4091,
    ligandName: "Metformin",
    category: "Metabolic",
    description:
      "The most prescribed diabetes drug globally. Activates AMP-activated protein kinase.",
  },
  {
    protein: "3ERT",
    proteinName: "Estrogen Receptor α",
    ligandCid: 2733526,
    ligandName: "Tamoxifen",
    category: "Cancer",
    description:
      "Selective estrogen receptor modulator for breast cancer. Blocks estrogen-driven tumor growth.",
  },
  {
    protein: "2RG6",
    proteinName: "Acetylcholinesterase",
    ligandCid: 3152,
    ligandName: "Donepezil",
    category: "Neuroscience",
    description:
      "Aricept — first-line treatment for Alzheimer's disease. Inhibits acetylcholine breakdown.",
  },
  {
    protein: "3NYA",
    proteinName: "EGFR Kinase",
    ligandCid: 176870,
    ligandName: "Erlotinib",
    category: "Cancer",
    description:
      "Targets epidermal growth factor receptor in non-small cell lung cancer.",
  },
  {
    protein: "3OGP",
    proteinName: "HMG-CoA Reductase",
    ligandCid: 60823,
    ligandName: "Atorvastatin",
    category: "Cardiovascular",
    description:
      "Lipitor — the best-selling drug in history. Lowers cholesterol by inhibiting its synthesis.",
  },
  {
    protein: "2ITO",
    proteinName: "Dihydrofolate Reductase",
    ligandCid: 126941,
    ligandName: "Methotrexate",
    category: "Cancer",
    description:
      "Antimetabolite chemotherapy drug. Blocks folate metabolism essential for DNA synthesis.",
  },
  {
    protein: "1PWC",
    proteinName: "Penicillin-Binding Protein",
    ligandCid: 5904,
    ligandName: "Penicillin G",
    category: "Antibiotic",
    description:
      "The drug that started the antibiotic revolution. Disrupts bacterial cell wall synthesis.",
  },
];

const CATEGORIES = [
  "All",
  ...Array.from(new Set(EXAMPLES.map((e) => e.category))),
];

export default function Examples() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

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
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <View style={styles.searchArea}>
        <TextInput
          style={styles.input}
          value={search}
          onChangeText={setSearch}
          placeholder="Search examples (e.g. cancer, aspirin...)"
          placeholderTextColor="#4b5563"
          autoCapitalize="none"
          autoCorrect={false}
        />

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
                  category === cat
                    ? styles.pillTextActive
                    : styles.pillTextInactive,
                ]}
              >
                {cat}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
      >
        {filtered.map((ex) => (
          <Pressable
            key={`${ex.protein}-${ex.ligandCid}`}
            style={styles.card}
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
            <View style={styles.cardRow}>
              <View style={styles.cardInfo}>
                <View style={styles.titleRow}>
                  <Text style={styles.ligandName}>{ex.ligandName}</Text>
                  <View style={styles.catBadge}>
                    <Text style={styles.catText}>{ex.category}</Text>
                  </View>
                </View>
                <Text style={styles.meta}>
                  {ex.protein} · {ex.proteinName} · CID {ex.ligandCid}
                </Text>
                <Text style={styles.desc}>{ex.description}</Text>
              </View>
              <Image
                source={{ uri: getMoleculeImageUrl(ex.ligandCid) }}
                style={styles.thumb}
                resizeMode="contain"
              />
            </View>
          </Pressable>
        ))}

        {filtered.length === 0 && (
          <Text style={styles.empty}>No examples match your search.</Text>
        )}

        <Text style={styles.footnote}>
          {EXAMPLES.length} curated examples · Tap to skip straight to docking
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },
  searchArea: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 12,
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
    marginBottom: 12,
  },
  pills: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 24,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 50,
  },
  pillActive: {
    backgroundColor: "#fff",
  },
  pillInactive: {
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  pillText: {
    fontSize: 11,
  },
  pillTextActive: {
    color: "#000",
  },
  pillTextInactive: {
    color: "#9ca3af",
  },
  list: { flex: 1 },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    gap: 10,
  },
  card: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    padding: 16,
  },
  cardRow: {
    flexDirection: "row",
    gap: 12,
  },
  cardInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  ligandName: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
  catBadge: {
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 50,
  },
  catText: {
    color: "#9ca3af",
    fontSize: 10,
  },
  meta: {
    color: "#6b7280",
    fontSize: 11,
    marginBottom: 6,
  },
  desc: {
    color: "#6b7280",
    fontSize: 11,
    lineHeight: 16,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  empty: {
    color: "#6b7280",
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 32,
  },
  footnote: {
    color: "#4b5563",
    fontSize: 10,
    textAlign: "center",
    marginTop: 16,
  },
});
