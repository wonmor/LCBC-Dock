import { View, Text, Image, Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getMoleculeImageUrl } from "@/lib/api";
import { palette, type, rule, space, fonts } from "@/lib/theme";

export interface Example {
  protein: string;
  proteinName: string;
  ligandCid: number;
  ligandName: string;
  category: string;
  description: string;
}

/** Framed row: 2D structure on white, drug name, target, one-line story. */
export default function ExampleCard({ ex, onPress, showCid, style, lines = 1 }: {
  ex: Example;
  onPress: () => void;
  showCid?: boolean;
  style?: StyleProp<ViewStyle>;
  lines?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${ex.ligandName} docked into ${ex.proteinName}, ${ex.protein}`}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: palette.groundSoft }, style]}
    >
      <View style={styles.thumbFrame}>
        <Image source={{ uri: getMoleculeImageUrl(ex.ligandCid) }} style={styles.thumb} resizeMode="contain" />
      </View>
      <View style={styles.info}>
        <Text style={type.label} numberOfLines={1}>
          {ex.category}
        </Text>
        <Text style={styles.name} numberOfLines={1}>
          {ex.ligandName}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {ex.protein} | {ex.proteinName}
          {showCid ? ` | CID ${ex.ligandCid}` : ""}
        </Text>
        <Text style={type.caption} numberOfLines={lines}>
          {ex.description}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={palette.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: rule.regular,
    borderColor: palette.ink,
    backgroundColor: palette.ground,
    padding: 12,
  },
  thumbFrame: { borderWidth: rule.regular, borderColor: palette.ink, backgroundColor: palette.ground, padding: 2 },
  thumb: { width: 52, height: 52 },
  info: { flex: 1, gap: 1 },
  name: { fontFamily: fonts.bold, fontSize: 18, color: palette.ink },
  meta: { fontFamily: fonts.medium, fontSize: 13, color: palette.ink, marginBottom: space.xs / 2 },
});
