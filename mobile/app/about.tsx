import { View, Text, ScrollView, Linking, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GlyphTile, Panel, ScreenHeading, SectionTitle, TextLink, type IconName } from "@/components/Bauhaus";
import { palette, type, space, fonts, maxContent } from "@/lib/theme";

const SOURCES: [IconName, string, string][] = [
  ["cube", "Proteins", "RCSB Protein Data Bank, more than 200,000 structures"],
  ["flask", "Molecules", "PubChem, more than 100 million compounds"],
];

const USES: [IconName, string][] = [
  ["medkit-outline", "Drug design and virtual screening"],
  ["git-network-outline", "Protein function prediction"],
  ["link-outline", "Protein-ligand interaction studies"],
  ["school-outline", "Computational chemistry education"],
];

export default function About() {
  return (
    <SafeAreaView style={styles.safe} edges={["bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeading title="About MolDock" />

        <Text style={[type.body, styles.para]}>
          <Text style={type.bodyBold}>MolDock</Text> is a molecular docking platform powered by AutoDock Vina. Search
          proteins and small molecules from public databases, set the docking parameters, and explore the results in
          3D, all from your phone.
        </Text>
        <Text style={[type.body, styles.para]}>
          <Text style={type.bodyBold}>Molecular docking</Text> predicts how a small molecule (the ligand) binds to a
          protein target. It is fundamental to drug discovery, helping researchers find promising candidates before
          expensive lab experiments.
        </Text>

        <SectionTitle title="Data sources" />
        <View style={styles.rows}>
          {SOURCES.map(([icon, title, detail]) => (
            <View key={title} style={styles.row}>
              <GlyphTile icon={icon} fill={palette.blue} />
              <View style={{ flex: 1 }}>
                <Text style={type.bodyBold}>{title}</Text>
                <Text style={type.caption}>{detail}</Text>
              </View>
            </View>
          ))}
        </View>

        <SectionTitle title="Applications" />
        <View style={styles.rows}>
          {USES.map(([icon, text]) => (
            <View key={text} style={styles.row}>
              <Ionicons name={icon} size={20} color={palette.ink} />
              <Text style={[type.body, { flex: 1 }]}>{text}</Text>
            </View>
          ))}
        </View>

        <Panel fill={palette.yellow} style={styles.panel}>
          <Text style={type.headline}>A note on exhaustiveness</Text>
          <Text style={type.body}>
            Docking jobs run with a default exhaustiveness of 4 to keep wait times short. Higher exhaustiveness (8 to
            32) gives more accurate results but takes much longer. With more funding we plan to move to more powerful
            compute so everyone gets higher exhaustiveness and faster turnaround.
          </Text>
        </Panel>

        <Panel style={styles.panel}>
          <Text style={type.body}>
            A big thank you to <Text style={type.bodyBold}>Professor Juyong Lee</Text> at the Seoul National University
            Computational Drug Discovery Lab for the inspiration, and for the opportunity to intern at the lab.
          </Text>
        </Panel>

        <Panel style={styles.panel}>
          <Text style={type.headline}>Funding and research inquiries</Text>
          <Text style={type.body}>
            If you would like to support this project, collaborate on research or ask about funding, please get in
            touch.
          </Text>
          <TextLink title="john@orchestrsim.com" icon="mail-outline" align="left" onPress={() => Linking.openURL("mailto:john@orchestrsim.com").catch(() => {})} />
        </Panel>

        <Text style={[type.caption, styles.footer]}>Built by John Wonmo Seong | UC Irvine and Seoul National University</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.ground },
  content: { padding: space.m, paddingBottom: space.xl, maxWidth: maxContent, alignSelf: "center", width: "100%" },
  para: { marginBottom: space.m },
  rows: { gap: 12, marginBottom: space.l },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  panel: { gap: space.s, marginTop: space.m },
  footer: { textAlign: "center", marginTop: space.xl, fontFamily: fonts.regular },
});
