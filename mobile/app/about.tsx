import { View, Text, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function About() {
  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>About</Text>

        <Text style={styles.body}>
          <Text style={styles.bold}>LCBC Dock</Text> is an online molecular
          docking platform powered by AutoDock Vina. It lets you search for
          proteins and small molecules from public databases, configure docking
          parameters, and visualize results — entirely from your phone.
        </Text>

        <Text style={styles.body}>
          <Text style={styles.bold}>Molecular docking</Text> predicts how a
          small molecule (ligand) binds to a protein target. This is fundamental
          to drug discovery, helping researchers identify promising drug
          candidates before expensive lab experiments.
        </Text>

        <Text style={styles.sectionTitle}>Data Sources</Text>
        <Text style={styles.listItem}>
          Proteins — RCSB Protein Data Bank (200,000+ structures)
        </Text>
        <Text style={styles.listItem}>
          Molecules — PubChem (100M+ compounds)
        </Text>

        <Text style={styles.sectionTitle}>Applications</Text>
        <Text style={styles.listItem}>Drug design and virtual screening</Text>
        <Text style={styles.listItem}>Protein function prediction</Text>
        <Text style={styles.listItem}>
          Protein-ligand interaction studies
        </Text>
        <Text style={styles.listItem}>
          Computational chemistry education
        </Text>

        <Text style={styles.footer}>
          Built by John Seong · Seoul National University
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 40,
  },
  heading: {
    fontSize: 32,
    fontWeight: "200",
    color: "#fff",
    textAlign: "center",
    marginBottom: 32,
  },
  body: {
    color: "#9ca3af",
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 20,
  },
  bold: {
    color: "#fff",
    fontWeight: "600",
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 8,
    marginTop: 8,
  },
  listItem: {
    color: "#9ca3af",
    fontSize: 12,
    lineHeight: 20,
    paddingLeft: 8,
  },
  footer: {
    color: "#4b5563",
    fontSize: 11,
    textAlign: "center",
    marginTop: 40,
  },
});
