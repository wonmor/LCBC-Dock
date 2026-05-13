import { View, Text, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function About() {
  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>About</Text>

        <Text style={styles.body}>
          <Text style={styles.bold}>DockMole</Text> is an online molecular
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

        <View style={styles.shoutout}>
          <Text style={styles.sectionTitle}>A Note on Exhaustiveness</Text>
          <Text style={styles.listItem}>
            Docking jobs currently run with a default exhaustiveness of 4 to keep wait
            times short on our current server. Higher exhaustiveness (8-32) produces more
            accurate results but takes significantly longer. With additional funding, we
            plan to upgrade to more powerful compute infrastructure to support higher
            exhaustiveness and faster turnaround for all users.
          </Text>
        </View>

        <View style={styles.shoutout}>
          <Text style={styles.body}>
            A big shoutout to <Text style={styles.bold}>Professor Juyong Lee</Text> at
            Seoul National University Computational Drug Discovery Lab for the inspiration
            and providing me a valuable opportunity to intern at your lab.
          </Text>
        </View>

        <View style={styles.shoutout}>
          <Text style={styles.sectionTitle}>Funding & Research Inquiries</Text>
          <Text style={styles.listItem}>
            If you are interested in supporting this project, collaborating on research,
            or have funding inquiries, please reach out:
          </Text>
          <Text style={styles.email}>john@orchestrsim.com</Text>
        </View>

        <Text style={styles.footer}>
          Built by John Wonmo Seong · UC Irvine × Seoul National University
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
    maxWidth: 600,
    alignSelf: "center",
    width: "100%",
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
  shoutout: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    padding: 20,
    marginTop: 24,
  },
  email: {
    color: "#60a5fa",
    fontSize: 14,
    marginTop: 8,
  },
  footer: {
    color: "#4b5563",
    fontSize: 11,
    textAlign: "center",
    marginTop: 24,
  },
});
