import { useState, useMemo } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import ExampleCard, { type Example } from "@/components/ExampleCard";
import { BoxedInput, Rule, TagButton } from "@/components/Bauhaus";
import { palette, type, space, rule, maxContent } from "@/lib/theme";

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
    <SafeAreaView style={styles.safe} edges={["bottom", "left", "right"]}>
      <View style={styles.searchArea}>
        <BoxedInput
          icon="search"
          value={search}
          onChangeText={setSearch}
          placeholder="Search drugs, targets, diseases"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills} style={{ flexGrow: 0 }}>
          {CATEGORIES.map((cat) => (
            <TagButton key={cat} title={cat} selected={category === cat} onPress={() => setCategory(cat)} />
          ))}
        </ScrollView>
      </View>
      <Rule thickness={rule.thick} />

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
        {filtered.map((ex) => (
          <ExampleCard
            key={`${ex.protein}-${ex.ligandCid}`}
            ex={ex}
            showCid
            lines={3}
            onPress={() =>
              router.push({
                pathname: "/docking/cook",
                params: { proteinState: ex.protein, ligandCid: String(ex.ligandCid), ligandName: ex.ligandName },
              })
            }
          />
        ))}

        {filtered.length === 0 && <Text style={[type.caption, styles.empty]}>No examples match your search.</Text>}

        <Text style={[type.caption, styles.footnote]}>
          {EXAMPLES.length} curated examples. Tap one to go straight to docking.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.ground },
  searchArea: { paddingHorizontal: space.m, paddingTop: space.m, paddingBottom: 12, gap: 12 },
  pills: { flexDirection: "row", gap: space.s, paddingRight: space.m },
  list: { flex: 1 },
  listContent: {
    padding: space.m,
    paddingBottom: space.xl,
    gap: space.s,
    maxWidth: maxContent,
    alignSelf: "center",
    width: "100%",
  },
  empty: { textAlign: "center", paddingVertical: space.xl },
  footnote: { textAlign: "center", marginTop: space.m },
});
