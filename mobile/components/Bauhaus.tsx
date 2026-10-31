/**
 * Bauhaus primitives for MolDock. Every screen is built from these and the
 * tokens in lib/theme.ts, so the look lives in one place.
 */
import type { ReactNode } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { palette, type, space, rule, tapTarget, fonts } from "@/lib/theme";

export type IconName = keyof typeof Ionicons.glyphMap;

export function Rule({ thickness = rule.regular, color = palette.ink, style }: {
  thickness?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[{ height: thickness, backgroundColor: color }, style]} accessibilityElementsHidden />;
}

/** Big screen title with an optional eyebrow and subtitle, ruled underneath. */
export function ScreenHeading({ eyebrow, title, subtitle }: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={s.heading} accessibilityRole="header">
      {eyebrow ? <Text style={type.label}>{eyebrow}</Text> : null}
      <Text style={type.title} numberOfLines={2} adjustsFontSizeToFit>
        {title}
      </Text>
      {subtitle ? <Text style={type.caption}>{subtitle}</Text> : null}
      <Rule thickness={rule.thick} style={{ marginTop: space.s }} />
    </View>
  );
}

/** Uppercase tracked label with a thick rule beneath. */
export function SectionTitle({ title, accessory }: { title: string; accessory?: ReactNode }) {
  return (
    <View style={s.section} accessibilityRole="header">
      <View style={s.sectionRow}>
        <Text style={type.section}>{title}</Text>
        {accessory}
      </View>
      <Rule thickness={rule.thick} />
    </View>
  );
}

type ButtonKind = "primary" | "action" | "secondary" | "pro";

const BUTTON_FILL: Record<ButtonKind, string> = {
  primary: palette.ink,
  action: palette.blue,
  secondary: palette.ground,
  pro: palette.red,
};

/** Wide square button: black (primary), blue (action), outlined (secondary), red (Pro). */
export function BarButton({ title, icon, kind = "primary", onPress, disabled, style, testID }: {
  title: string;
  icon?: IconName;
  kind?: ButtonKind;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const fg = disabled
    ? kind === "secondary" ? palette.inkDisabled : palette.ground
    : kind === "secondary" ? palette.ink : palette.ground;
  const bg = disabled ? (kind === "secondary" ? palette.ground : palette.inkDisabled) : BUTTON_FILL[kind];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        s.bar,
        { backgroundColor: bg, borderColor: disabled ? palette.inkDisabled : palette.ink },
        pressed && !disabled && { opacity: 0.8 },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={17} color={fg} /> : null}
      <Text style={[type.button, { color: fg }]} numberOfLines={1} adjustsFontSizeToFit>
        {title}
      </Text>
    </Pressable>
  );
}

/** Square outlined glyph button, e.g. Back in the step bar. */
export function IconButton({ icon, label, onPress, fill = palette.ground }: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  fill?: string;
}) {
  const fg = fill === palette.ground || fill === palette.yellow ? palette.ink : palette.ground;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [s.iconBtn, { backgroundColor: fill }, pressed && { opacity: 0.8 }]}
    >
      <Ionicons name={icon} size={22} color={fg} />
    </Pressable>
  );
}

/** Small outlined inline action; filled blue when selected. */
export function TagButton({ title, icon, selected, onPress, style }: {
  title: string;
  icon?: IconName;
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const fg = selected ? palette.ground : palette.ink;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [
        s.tag,
        { backgroundColor: selected ? palette.blue : palette.ground },
        pressed && { opacity: 0.8 },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={14} color={fg} /> : null}
      <Text style={[s.tagText, { color: fg }]} numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
  );
}

/** Adjoining outlined segments; the selected one is a blue field. */
export function Segmented<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={s.segmented} accessibilityRole="tablist">
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            style={[
              s.segment,
              { backgroundColor: on ? palette.blue : palette.ground },
              i > 0 && { borderLeftWidth: rule.regular, borderLeftColor: palette.ink },
            ]}
          >
            {o.icon ? <Ionicons name={o.icon} size={15} color={on ? palette.ground : palette.ink} /> : null}
            <Text style={[type.button, s.segmentText, { color: on ? palette.ground : palette.ink }]} numberOfLines={1} adjustsFontSizeToFit>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Text field in a 2 pt black frame, with an optional leading glyph. */
export function BoxedInput({ icon, style, large, ...props }: TextInputProps & { icon?: IconName; large?: boolean }) {
  return (
    <View style={[s.input, style as StyleProp<ViewStyle>]}>
      {icon ? <Ionicons name={icon} size={18} color={palette.ink} /> : null}
      <TextInput
        placeholderTextColor={palette.inkDisabled}
        selectionColor={palette.blue}
        {...props}
        style={[s.inputText, large && s.inputLarge]}
      />
    </View>
  );
}

/** White panel with the 2 pt frame. */
export function Panel({ children, fill = palette.ground, style }: {
  children: ReactNode;
  fill?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[s.panel, { backgroundColor: fill }, style]}>{children}</View>;
}

/** A flat field of primary colour carrying one glyph, used as a row marker. */
export function GlyphTile({ icon, fill = palette.blue, size = 34 }: { icon: IconName; fill?: string; size?: number }) {
  const fg = fill === palette.yellow || fill === palette.ground ? palette.ink : palette.ground;
  return (
    <View style={[s.tile, { width: size, height: size, backgroundColor: fill }]} accessibilityElementsHidden>
      <Ionicons name={icon} size={Math.round(size * 0.5)} color={fg} />
    </View>
  );
}

/** Number over an uppercase label, in a framed cell. */
export function Stat({ value, label, fill = palette.ground }: { value: string | number; label: string; fill?: string }) {
  return (
    <View style={[s.stat, { backgroundColor: fill }]}>
      <Text style={type.number} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={[type.label, { color: palette.ink }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

/** Label on the left, value on the right, thin rule beneath. */
export function KeyValue({ label, value, mono, last }: { label: string; value: ReactNode; mono?: boolean; last?: boolean }) {
  return (
    <View style={[s.kv, !last && s.kvRule]}>
      <Text style={type.label}>{label}</Text>
      {typeof value === "string" || typeof value === "number" ? (
        <Text style={[mono ? type.mono : type.bodyBold, s.kvValue]} numberOfLines={2}>
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  );
}

type MessageKind = "error" | "notice" | "attention";

const MESSAGE: Record<MessageKind, { fill: string; fg: string; icon: IconName }> = {
  error: { fill: palette.red, fg: palette.ground, icon: "alert-circle" },
  notice: { fill: palette.blue, fg: palette.ground, icon: "checkmark-circle" },
  attention: { fill: palette.yellow, fg: palette.ink, icon: "information-circle" },
};

/** Flat coloured bar for errors (red), confirmations (blue) and limits (yellow). */
export function Message({ kind, text, onPress }: { kind: MessageKind; text: string; onPress?: () => void }) {
  const m = MESSAGE[kind];
  const body = (
    <View style={[s.message, { backgroundColor: m.fill }]} accessibilityRole={kind === "error" ? "alert" : undefined}>
      <Ionicons name={m.icon} size={18} color={m.fg} />
      <Text style={[type.body, { color: m.fg, flex: 1, fontSize: 14, lineHeight: 20 }]}>{text}</Text>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={m.fg} /> : null}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="link">
      {body}
    </Pressable>
  ) : (
    body
  );
}

/** Underlined text link in ink. */
export function TextLink({ title, onPress, icon, align = "center" }: {
  title: string;
  onPress?: () => void;
  icon?: IconName;
  align?: "center" | "left";
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      hitSlop={8}
      style={[s.link, align === "center" ? { alignSelf: "center" } : { alignSelf: "flex-start" }]}
    >
      {icon ? <Ionicons name={icon} size={15} color={palette.ink} /> : null}
      <Text style={s.linkText}>{title}</Text>
    </Pressable>
  );
}

/** Fixed bottom bar for the docking steps: step tracker and the next action. */
export function BottomBar({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.bottomBar, { paddingBottom: Math.max(insets.bottom, space.m) }]}>
      <Rule thickness={rule.thick} />
      <View style={s.bottomInner}>{children}</View>
    </View>
  );
}

/** Navigation header: white field, back glyph, uppercase title, thick rule. */
export function Header({ title, canGoBack, onBack, right }: {
  title: string;
  canGoBack: boolean;
  onBack: () => void;
  right?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: palette.ground, paddingTop: insets.top }}>
      <View style={s.header}>
        <View style={s.headerSide}>
          {canGoBack ? (
            <Pressable onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" style={s.headerBack}>
              <Ionicons name="arrow-back" size={22} color={palette.ink} />
            </Pressable>
          ) : null}
        </View>
        <Text style={[type.section, s.headerTitle]} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        <View style={[s.headerSide, { alignItems: "flex-end" }]}>{right}</View>
      </View>
      <Rule thickness={rule.thick} />
    </View>
  );
}

const s = StyleSheet.create({
  heading: { gap: space.xs, marginBottom: space.l },
  section: { gap: space.s, marginBottom: space.m },
  sectionRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: space.s },
  bar: {
    minHeight: tapTarget + 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.s,
    paddingHorizontal: space.m,
    borderWidth: rule.regular,
  },
  iconBtn: {
    width: tapTarget + 6,
    height: tapTarget + 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: rule.regular,
    borderColor: palette.ink,
  },
  tag: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    borderWidth: rule.regular,
    borderColor: palette.ink,
  },
  tagText: { fontFamily: fonts.semibold, fontSize: 14 },
  segmented: { flexDirection: "row", borderWidth: rule.regular, borderColor: palette.ink, height: tapTarget },
  segment: { flex: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  segmentText: { fontSize: 13, letterSpacing: 0.8 },
  input: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: space.s + 2,
    paddingHorizontal: 12,
    borderWidth: rule.regular,
    borderColor: palette.ink,
    backgroundColor: palette.ground,
  },
  inputText: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: palette.ink, paddingVertical: 12 },
  inputLarge: { fontFamily: fonts.semibold, fontSize: 28, letterSpacing: 8, textAlign: "center" },
  panel: { borderWidth: rule.regular, borderColor: palette.ink, padding: space.m },
  tile: { alignItems: "center", justifyContent: "center", borderWidth: rule.regular, borderColor: palette.ink },
  stat: { flex: 1, minWidth: "45%", borderWidth: rule.regular, borderColor: palette.ink, padding: 12, gap: 2 },
  kv: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.m, paddingVertical: 10 },
  kvRule: { borderBottomWidth: rule.thin, borderBottomColor: palette.ink },
  kvValue: { flexShrink: 1, textAlign: "right" },
  message: { flexDirection: "row", alignItems: "center", gap: space.s + 2, padding: 12, borderWidth: rule.regular, borderColor: palette.ink },
  link: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6 },
  linkText: { fontFamily: fonts.semibold, fontSize: 14, color: palette.ink, textDecorationLine: "underline" },
  bottomBar: { backgroundColor: palette.ground },
  bottomInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.m,
    paddingHorizontal: space.m,
    paddingTop: 12,
  },
  header: { height: 52, flexDirection: "row", alignItems: "center", paddingHorizontal: space.s },
  headerSide: { width: 64, justifyContent: "center" },
  headerBack: { width: tapTarget, height: tapTarget, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 14 },
});
