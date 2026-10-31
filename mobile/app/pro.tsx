import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, Platform, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import Spinner from "@/components/Spinner";
import { BarButton, GlyphTile, Message, Panel, SectionTitle, TextLink, type IconName } from "@/components/Bauhaus";
import { backend } from "@/lib/api";
import { useAccount } from "@/lib/AccountContext";
import { isPaid, type PlanLimits } from "@/lib/account";
import { loadOffers, manageSubscriptions, type Offer, type PlanKey } from "@/lib/purchases";
import { palette, type, space, rule, fonts, maxContent } from "@/lib/theme";

const PRIVACY_URL = "https://wonmor.github.io/LCBC-Dock/privacy.html";
const APPLE_EULA_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
const LAB_QUOTE_URL = "https://lcbc-client.apps.johnseong.com/pricing#lab-quote";
const PLAY_TERMS_URL = "https://play.google.com/about/play-terms/";

const IS_IOS = Platform.OS === "ios";
const STORE_ACCOUNT = IS_IOS ? "Apple ID" : "Google Play account";
const MANAGE_WHERE = IS_IOS
  ? "in your Apple ID's Subscriptions settings"
  : "in the Play Store under Payments & subscriptions";

// Shown until /api/pricing answers; mirrors api/plans.py.
const FALLBACK_PRO: Partial<PlanLimits> = {
  jobs_per_day: 300,
  max_exhaustiveness: 32,
  max_num_modes: 20,
  max_box_edge: 40,
  max_batch_ligands: 500,
};

function features(pro: Partial<PlanLimits>, free: Partial<PlanLimits> | null): [IconName, string][] {
  return [
    ["flash", `${pro.jobs_per_day} dockings a day${free ? ` (Free: ${free.jobs_per_day})` : ""}`],
    ["options", `Exhaustiveness up to ${pro.max_exhaustiveness}${free ? ` (Free: ${free.max_exhaustiveness})` : ""}`],
    ["layers", `Up to ${pro.max_num_modes} poses and ${pro.max_box_edge} Å search boxes`],
    ["list", `Batch screening, up to ${pro.max_batch_ligands} ligands`],
    ["lock-closed", "Private jobs, kept until you delete them"],
    ["speedometer", "Priority queue"],
    ["key", "REST API keys and Pro on the web app"],
  ];
}

export default function Pro() {
  const router = useRouter();
  const { account, busy, notice, error, purchase, restore, clearMessages } = useAccount();
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [selected, setSelected] = useState<PlanKey>("annual");
  const [proLimits, setProLimits] = useState<Partial<PlanLimits>>(FALLBACK_PRO);
  const [freeLimits, setFreeLimits] = useState<Partial<PlanLimits> | null>(null);

  useEffect(() => {
    clearMessages();
    loadOffers()
      .then(setOffers)
      .catch(() => setOffers([]));
    backend
      .get("/api/pricing")
      .then((r) => {
        setProLimits(r.data?.tiers?.pro?.limits ?? FALLBACK_PRO);
        setFreeLimits(r.data?.tiers?.free?.limits ?? null);
      })
      .catch(() => {});
  }, [clearMessages]);

  const paid = isPaid(account);
  const offer = offers?.find((o) => o.plan === selected) ?? offers?.[0];
  const monthly = offers?.find((o) => o.plan === "monthly");
  const annual = offers?.find((o) => o.plan === "annual");
  const open = (url: string) => WebBrowser.openBrowserAsync(url).catch(() => {});

  return (
    <SafeAreaView style={styles.safe} edges={["bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Masthead: red is Pro */}
        <View style={styles.hero}>
          <View style={styles.heroFill}>
            <Ionicons name="star" size={28} color={palette.ground} />
            <Text style={styles.heroTitle}>MolDock Pro</Text>
          </View>
          <Text style={[type.body, styles.heroSub]}>Serious docking from your phone. Free stays free.</Text>
        </View>

        <SectionTitle title="What you get" />
        <View style={styles.features}>
          {features(proLimits, freeLimits).map(([icon, text]) => (
            <View key={text} style={styles.featureRow}>
              <Ionicons name={icon} size={20} color={palette.ink} />
              <Text style={[type.body, { flex: 1 }]}>{text}</Text>
            </View>
          ))}
        </View>

        {paid ? (
          <Panel style={{ gap: 12 }}>
            <View style={styles.activeRow}>
              <GlyphTile icon="checkmark" fill={palette.blue} />
              <Text style={type.headline}>You're on MolDock Pro</Text>
            </View>
            <Text style={type.caption}>
              {account?.sources.includes("stripe")
                ? "Billed through the MolDock website."
                : `Billed through your ${STORE_ACCOUNT}.`}
            </Text>
            {(account?.sources.includes("app_store") || account?.sources.includes("google_play")) && (
              <BarButton title="Manage subscription" icon="settings-outline" kind="secondary" onPress={() => manageSubscriptions().catch(() => {})} />
            )}
          </Panel>
        ) : offers === null ? (
          <Spinner label="Loading plans..." />
        ) : offers.length === 0 ? (
          <Message
            kind="attention"
            text={`Subscriptions aren't available right now. Check your connection and that you're signed in to your ${STORE_ACCOUNT}, then try again.`}
          />
        ) : (
          <View style={{ gap: 12 }}>
            <SectionTitle title="Choose a plan" />
            {offers.map((o) => {
              const active = o.plan === offer?.plan;
              const fg = active ? palette.ground : palette.ink;
              return (
                <Pressable
                  key={o.plan}
                  style={[styles.planCard, active && { backgroundColor: palette.blue }]}
                  onPress={() => setSelected(o.plan)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <Ionicons name={active ? "radio-button-on" : "radio-button-off"} size={22} color={fg} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.planName, { color: fg }]}>{o.plan === "annual" ? "Annual" : "Monthly"}</Text>
                    <Text style={[type.body, { color: fg }]}>
                      {o.price} {o.plan === "annual" ? "per year" : "per month"}
                    </Text>
                  </View>
                </Pressable>
              );
            })}

            {!account?.email && (
              <Message
                kind="attention"
                text="Sign in first so Pro also works on the web and your other devices."
                onPress={() => router.push({ pathname: "/account", params: { next: "pro" } })}
              />
            )}

            <BarButton
              title={busy ? "Working..." : `Subscribe for ${offer?.price} / ${offer?.plan === "annual" ? "year" : "month"}`}
              icon="star"
              kind="pro"
              onPress={() => offer && purchase(offer)}
              disabled={busy || !offer}
            />
          </View>
        )}

        <View style={{ gap: 12, marginTop: 12 }}>
          {notice && <Message kind="notice" text={notice} />}
          {error && <Message kind="error" text={error} />}
          <BarButton title="Restore purchases" icon="refresh" kind="secondary" onPress={restore} disabled={busy} />
        </View>

        <Panel style={{ gap: 6, marginTop: space.l }}>
          <Text style={type.headline}>For labs and classrooms</Text>
          <Text style={type.caption}>Shared seats for a whole lab, course or department, invoiced to your institution.</Text>
          <TextLink title="Request a quote" icon="mail-outline" align="left" onPress={() => open(LAB_QUOTE_URL)} />
        </Panel>

        <Text style={[type.caption, styles.terms]}>
          MolDock Pro is an auto-renewing subscription
          {monthly && annual ? ` (${monthly.price} per month or ${annual.price} per year)` : ""}.
          Payment is charged to your {STORE_ACCOUNT} when you confirm the purchase. The subscription
          renews automatically for the same period and price unless it is cancelled at least 24
          hours before the end of the current period; your account is charged for the renewal
          within the 24 hours before the period ends. You can manage or cancel it at any time{" "}
          {MANAGE_WHERE}. Cancelling keeps Pro until the end of the period you've paid for.
        </Text>

        <View style={styles.legalRow}>
          <TextLink title="Privacy Policy" onPress={() => open(PRIVACY_URL)} />
          <TextLink title="Terms of Use (EULA)" onPress={() => open(IS_IOS ? APPLE_EULA_URL : PLAY_TERMS_URL)} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.ground },
  content: { padding: space.m, paddingBottom: space.xl + space.m, maxWidth: maxContent, alignSelf: "center", width: "100%" },
  hero: { borderWidth: rule.regular, borderColor: palette.ink, marginBottom: space.l },
  heroFill: { backgroundColor: palette.red, flexDirection: "row", alignItems: "center", gap: 12, padding: space.m },
  heroTitle: { fontFamily: fonts.bold, fontSize: 30, color: palette.ground },
  heroSub: { padding: space.m, borderTopWidth: rule.regular, borderTopColor: palette.ink },
  features: { gap: 12, marginBottom: space.l },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  activeRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  planCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: rule.regular,
    borderColor: palette.ink,
    paddingVertical: 14,
    paddingHorizontal: space.m,
    backgroundColor: palette.ground,
  },
  planName: { fontFamily: fonts.bold, fontSize: 18 },
  terms: { fontSize: 11, lineHeight: 16, marginTop: space.l, textAlign: "center" },
  legalRow: { flexDirection: "row", justifyContent: "center", gap: space.l, marginTop: space.s },
});
