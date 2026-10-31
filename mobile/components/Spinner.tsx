import { ActivityIndicator, View, Text, StyleSheet } from "react-native";
import { palette, type, space } from "@/lib/theme";

interface Props {
  label?: string;
}

export default function Spinner({ label }: Props) {
  return (
    <View style={styles.container} accessibilityRole="progressbar" accessibilityLabel={label ?? "Loading"}>
      <ActivityIndicator size="small" color={palette.blue} />
      {label && <Text style={type.caption}>{label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", gap: space.s, paddingVertical: space.m },
});
