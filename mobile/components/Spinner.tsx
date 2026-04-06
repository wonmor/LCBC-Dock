import { ActivityIndicator, View, Text, StyleSheet } from "react-native";

interface Props {
  label?: string;
}

export default function Spinner({ label }: Props) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="small" color="#fff" />
      {label && <Text style={styles.label}>{label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 16,
  },
  label: {
    fontSize: 12,
    color: "#6b7280",
  },
});
