/**
 * MolDock design tokens: the Bauhaus language shared with John's other apps
 * (Title Capitalizr, OrchPCB, Jeb's).
 *
 * White ground, black ink, Jost geometric type, thick black rules, square
 * edges. The three primaries are flat fields with fixed meanings:
 *   blue   = action and selection
 *   yellow = attention (queue, limits, work in progress)
 *   red    = MolDock Pro and errors
 * No gradients, shadows, rounded corners or purple. Icons are glyphs
 * (Ionicons), never decorative shapes. The 3D viewer keeps a dark viewport
 * so molecules stay readable; it sits inside the black frame like a picture.
 */

export const palette = {
  ground: "#FFFFFF",
  ink: "#000000",
  /** 10.4:1 on white. */
  inkSecondary: "#3C3C3C",
  /** Disabled controls and placeholders only. */
  inkDisabled: "#767676",
  /** Quiet field behind code, logs and tables. */
  groundSoft: "#F2F2F2",
  /** Action and selection. White text on it is 9.1:1. */
  blue: "#0F3FA8",
  /** Attention. Always with black ink (12.6:1). */
  yellow: "#F2C230",
  /** Pro and errors, as a fill with white or black bold labels. */
  red: "#D62828",
  /** Red text on white (7.6:1). */
  redInk: "#A61B1B",
  /** The molecule viewport. */
  viewport: "#0A0A0A",
} as const;

/** Static Jost instances bundled in assets/fonts (SIL Open Font License). */
export const fonts = {
  regular: "Jost-Regular",
  medium: "Jost-Medium",
  semibold: "Jost-SemiBold",
  bold: "Jost-Bold",
  mono: "Menlo",
} as const;

export const fontFiles = {
  [fonts.regular]: require("../assets/fonts/Jost-Regular.ttf"),
  [fonts.medium]: require("../assets/fonts/Jost-Medium.ttf"),
  [fonts.semibold]: require("../assets/fonts/Jost-SemiBold.ttf"),
  [fonts.bold]: require("../assets/fonts/Jost-Bold.ttf"),
};

export const type = {
  display: { fontFamily: fonts.bold, fontSize: 40, lineHeight: 44, color: palette.ink },
  title: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 30, color: palette.ink },
  headline: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24, color: palette.ink },
  section: {
    fontFamily: fonts.bold,
    fontSize: 12,
    letterSpacing: 1.6,
    textTransform: "uppercase" as const,
    color: palette.ink,
  },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 23, color: palette.ink },
  bodyBold: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 23, color: palette.ink },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: palette.inkSecondary },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase" as const,
    color: palette.inkSecondary,
  },
  button: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    letterSpacing: 1,
    textTransform: "uppercase" as const,
  },
  number: { fontFamily: fonts.medium, fontSize: 28, lineHeight: 32, color: palette.ink },
  mono: { fontFamily: fonts.mono, fontSize: 12, color: palette.ink },
} as const;

export const space = { xs: 4, s: 8, m: 16, l: 24, xl: 32 } as const;

export const rule = { thin: 1, regular: 2, thick: 4, heavy: 8 } as const;

export const tapTarget = 44;

/** Content column width on tablets. */
export const maxContent = 680;
