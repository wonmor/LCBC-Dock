import { View, Text, StyleSheet } from "react-native";

const STEPS = ["Protein", "Prepare", "Ligand", "Dock"];

interface Props {
  current: number;
}

export default function StepIndicator({ current }: Props) {
  return (
    <View style={styles.container}>
      {STEPS.map((step, i) => (
        <View
          key={step}
          style={[styles.pill, i === current ? styles.pillActive : styles.pillInactive]}
        >
          <Text style={[styles.text, i === current ? styles.textActive : styles.textInactive]}>
            {step}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: 4,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pillActive: {
    backgroundColor: "#fff",
  },
  pillInactive: {
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  text: {
    fontSize: 10,
  },
  textActive: {
    color: "#000",
  },
  textInactive: {
    color: "#6b7280",
  },
});
