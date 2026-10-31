import { useState, useEffect, useMemo } from "react";
import { View, Text, Pressable, ScrollView, Image, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { getStats, type Stats } from "@/lib/api";
import { useIsWide } from "@/lib/useLayout";
import { useAccount } from "@/lib/AccountContext";
import { isPaid } from "@/lib/account";
import ExampleCard, { type Example } from "@/components/ExampleCard";
import {
  BarButton,
  BoxedInput,
  GlyphTile,
  Rule,
  SectionTitle,
  Stat,
  TagButton,
  type IconName,
} from "@/components/Bauhaus";
import { palette, type, space, rule, fonts, maxContent } from "@/lib/theme";

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
  const { account } = useAccount();
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

  const paid = isPaid(account);
  const nav: { icon: IconName; title: string; detail: string; fill: string; href: "/dashboard" | "/pro" | "/account" | "/about" }[] = [
    { icon: "pulse", title: "Dashboard", detail: "Track a docking job", fill: palette.blue, href: "/dashboard" },
    {
      icon: "star",
      title: "MolDock Pro",
      detail: paid ? "Your plan is active" : "Screening, private jobs, higher limits",
      fill: palette.red,
      href: "/pro",
    },
    { icon: "person", title: "Account", detail: account?.email ?? "Sign in with email", fill: palette.ink, href: "/account" },
    { icon: "information", title: "About", detail: "Docking, data sources, contact", fill: palette.ground, href: "/about" },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Masthead */}
        <View style={styles.masthead}>
          <Image source={require("../assets/brand-mark.png")} style={styles.mark} accessibilityIgnoresInvertColors />
          <View style={{ flex: 1 }}>
            <Text style={type.display} accessibilityRole="header">
              MolDock
            </Text>
            <Text style={type.label}>Protein-ligand docking</Text>
          </View>
          <Pressable
            onPress={() => router.push("/account")}
            accessibilityRole="button"
            accessibilityLabel="Account"
            hitSlop={8}
            style={styles.accountBtn}
          >
            <Ionicons name="person-circle-outline" size={28} color={palette.ink} />
          </Pressable>
        </View>
        <Rule thickness={rule.heavy} />
        <Text style={[type.body, styles.lede]}>
          Pick a protein and a molecule. AutoDock Vina docks them on our server, then you explore the pose in 3D.
        </Text>

        {/* Live server stats */}
        {stats && (
          <View style={styles.statsGrid}>
            <Stat value={stats.total_jobs} label="Total jobs" />
            <Stat value={stats.completed_jobs} label="Completed" />
            <Stat value={stats.queue_length + stats.active_jobs} label="In queue" fill={palette.yellow} />
            <Stat value={stats.est_wait_minutes === 0 ? "<1" : `~${stats.est_wait_minutes}`} label="Wait (min)" />
          </View>
        )}

        <BarButton
          title="Custom docking"
          icon="add"
          kind="action"
          onPress={() => router.push("/docking/protein")}
          style={{ marginBottom: space.xl }}
        />

        <SectionTitle title="Famous dockings" accessory={<Text style={type.label}>{filtered.length} of {EXAMPLES.length}</Text>} />

        <BoxedInput
          icon="search"
          value={search}
          onChangeText={setSearch}
          placeholder="Search drugs, targets, diseases"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills} style={styles.pillScroll}>
          {CATEGORIES.map((cat) => (
            <TagButton key={cat} title={cat} selected={category === cat} onPress={() => setCategory(cat)} />
          ))}
        </ScrollView>

        <View style={[styles.list, isWide && styles.gridWide]}>
          {filtered.map((ex) => (
            <ExampleCard
              key={`${ex.protein}-${ex.ligandCid}`}
              ex={ex}
              style={isWide ? styles.exCardWide : undefined}
              onPress={() =>
                router.push({
                  pathname: "/docking/cook",
                  params: { proteinState: ex.protein, ligandCid: String(ex.ligandCid), ligandName: ex.ligandName },
                })
              }
            />
          ))}
        </View>

        {filtered.length === 0 && <Text style={[type.caption, styles.empty]}>No examples match your search.</Text>}

        <View style={{ marginTop: space.xl }}>
          <SectionTitle title="More" />
          <View style={[styles.navGrid, isWide && styles.gridWide]}>
            {nav.map((n) => (
              <Pressable
                key={n.title}
                onPress={() => router.push(n.href)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.navRow, isWide && styles.exCardWide, pressed && { backgroundColor: palette.groundSoft }]}
              >
                <GlyphTile icon={n.icon} fill={n.fill} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={type.bodyBold}>{n.title}</Text>
                  <Text style={type.caption} numberOfLines={1}>
                    {n.detail}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={palette.ink} />
              </Pressable>
            ))}
          </View>
        </View>

        <Text style={[type.caption, styles.footer]}>
          Built by John Wonmo Seong | UC Irvine and Seoul National University
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.ground },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: space.m,
    paddingTop: space.m,
    paddingBottom: space.xl + space.m,
    maxWidth: maxContent + 120,
    alignSelf: "center",
    width: "100%",
  },
  masthead: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  mark: { width: 56, height: 56, borderWidth: rule.regular, borderColor: palette.ink },
  accountBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  lede: { marginTop: space.m, marginBottom: space.l },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.s, marginBottom: space.l },
  pills: { flexDirection: "row", gap: space.s },
  pillScroll: { marginTop: 12, marginBottom: space.m, flexGrow: 0 },
  list: { gap: space.s },
  gridWide: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  exCardWide: { width: "49.3%" },
  empty: { textAlign: "center", paddingVertical: space.l },
  navGrid: { gap: space.s },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: rule.regular,
    borderColor: palette.ink,
    padding: 12,
    backgroundColor: palette.ground,
  },
  footer: { textAlign: "center", marginTop: space.xl, fontFamily: fonts.regular },
});
