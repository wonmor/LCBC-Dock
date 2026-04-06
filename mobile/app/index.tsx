import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Home() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.title}>
            LCBC <Text style={styles.titleBold}>DOCK</Text>
          </Text>
          <Text style={styles.subtitle}>
            Molecular docking in your pocket.{"\n"}Powered by AutoDock Vina.
          </Text>

          <Pressable
            style={styles.cta}
            onPress={() => router.push("/docking/protein")}
          >
            <Text style={styles.ctaText}>Start Docking</Text>
          </Pressable>
        </View>

        <View style={styles.cards}>
          {[
            {
              title: "Search",
              desc: "200K+ proteins from RCSB PDB. 100M+ molecules from PubChem.",
            },
            {
              title: "Dock",
              desc: "Configure grid box, submit to queue, get email when done.",
            },
            {
              title: "View",
              desc: "Interactive 3D viewer. Download PDB or PDBQT results.",
            },
          ].map((card) => (
            <View key={card.title} style={styles.card}>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardDesc}>{card.desc}</Text>
            </View>
          ))}
        </View>

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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#000",
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  hero: {
    alignItems: "center",
    marginBottom: 40,
  },
  title: {
    fontSize: 52,
    fontWeight: "200",
    color: "#fff",
    letterSpacing: 2,
    marginBottom: 8,
  },
  titleBold: {
    fontWeight: "600",
  },
  subtitle: {
    color: "#9ca3af",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
  cta: {
    backgroundColor: "#fff",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 50,
  },
  ctaText: {
    color: "#000",
    fontSize: 14,
    fontWeight: "500",
  },
  cards: {
    width: "100%",
    gap: 12,
    marginBottom: 32,
  },
  card: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    padding: 16,
  },
  cardTitle: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 4,
  },
  cardDesc: {
    color: "#6b7280",
    fontSize: 11,
    lineHeight: 16,
  },
  navRow: {
    flexDirection: "row",
    gap: 24,
    marginBottom: 24,
  },
  navLink: {
    color: "#9ca3af",
    fontSize: 13,
  },
  footer: {
    color: "#4b5563",
    fontSize: 11,
  },
});
