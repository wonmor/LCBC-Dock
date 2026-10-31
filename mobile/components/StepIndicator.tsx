import { View, Text, StyleSheet } from "react-native";
import { palette, fonts, rule } from "@/lib/theme";

const STEPS = ["Protein", "Prepare", "Ligand", "Dock"];

interface Props {
  current: number;
}

/** Four adjoining numbered cells; done steps are black, the current one blue. */
export default function StepIndicator({ current }: Props) {
  return (
    <View
      style={styles.container}
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${current + 1} of ${STEPS.length}: ${STEPS[current]}`}
    >
      {STEPS.map((step, i) => {
        const fill = i === current ? palette.blue : i < current ? palette.ink : palette.ground;
        const fg = i <= current ? palette.ground : palette.ink;
        return (
          <View key={step} style={[styles.cell, { backgroundColor: fill }, i > 0 && styles.divider]}>
            <Text style={[styles.num, { color: fg }]}>{i + 1}</Text>
            {i === current ? <Text style={[styles.text, { color: fg }]}>{step}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", borderWidth: rule.regular, borderColor: palette.ink, height: 36 },
  cell: { minWidth: 32, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 8 },
  divider: { borderLeftWidth: rule.regular, borderLeftColor: palette.ink },
  num: { fontFamily: fonts.bold, fontSize: 14 },
  text: { fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
});
