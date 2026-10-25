import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, Platform, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import Spinner from "@/components/Spinner";
import { backend } from "@/lib/api";
import { useAccount } from "@/lib/AccountContext";
import { isPaid, type PlanLimits } from "@/lib/account";
import { loadOffers, manageSubscriptions, type Offer, type PlanKey } from "@/lib/purchases";

const PRIVACY_URL = "https://wonmor.github.io/LCBC-Dock/privacy.html";
const APPLE_EULA_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
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

type IconName = keyof typeof Ionicons.glyphMap;

function features(pro: Partial<PlanLimits>, free: Partial<PlanLimits> | null): [IconName, string][] {
  return [
    ["flash-outline", `${pro.jobs_per_day} dockings a day${free ? ` (Free: ${free.jobs_per_day})` : ""}`],
    ["options-outline", `Exhaustiveness up to ${pro.max_exhaustiveness}${free ? ` (Free: ${free.max_exhaustiveness})` : ""}`],
    ["layers-outline", `Up to ${pro.max_num_modes} poses and ${pro.max_box_edge} Å search boxes`],
    ["list-outline", `Batch screening, up to ${pro.max_batch_ligands} ligands`],
    ["lock-closed-outline", "Private jobs, kept until you delete them"],
    ["speedometer-outline", "Priority queue"],
    ["key-outline", "REST API keys and Pro on the web app"],
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
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>
          MolDock <Text style={styles.headingBold}>Pro</Text>
        </Text>
        <Text style={styles.sub}>Serious docking from your phone. Free stays free.</Text>

        <View style={styles.card}>
          {features(proLimits, freeLimits).map(([icon, text]) => (
            <View key={text} style={styles.featureRow}>
              <Ionicons name={icon} size={16} color="#9ca3af" />
              <Text style={styles.featureText}>{text}</Text>
            </View>
          ))}
        </View>

        {paid ? (
          <View style={styles.card}>
            <Text style={styles.activeTitle}>You're on MolDock Pro</Text>
            <Text style={styles.meta}>
              {account?.sources.includes("stripe")
                ? "Billed through the MolDock website."
                : `Billed through your ${STORE_ACCOUNT}.`}
            </Text>
            {(account?.sources.includes("app_store") || account?.sources.includes("google_play")) && (
              <Pressable style={styles.secondaryBtn} onPress={() => manageSubscriptions().catch(() => {})}>
                <Text style={styles.secondaryText}>Manage subscription</Text>
              </Pressable>
            )}
          </View>
        ) : offers === null ? (
          <Spinner label="Loading plans..." />
        ) : offers.length === 0 ? (
          <Text style={styles.meta}>
            Subscriptions aren't available right now. Check your connection and that you're signed
            in to your {STORE_ACCOUNT}, then try again.
          </Text>
        ) : (
          <>
            {offers.map((o) => {
              const active = o.plan === offer?.plan;
              return (
                <Pressable
                  key={o.plan}
                  style={[styles.planCard, active && styles.planCardActive]}
                  onPress={() => setSelected(o.plan)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.planName}>{o.plan === "annual" ? "Annual" : "Monthly"}</Text>
                    <Text style={styles.planPrice}>
                      {o.price} {o.plan === "annual" ? "per year" : "per month"}
                    </Text>
                  </View>
                  {active && <Ionicons name="checkmark" size={20} color="#fff" />}
                </Pressable>
              );
            })}

            {!account?.email && (
              <Pressable onPress={() => router.push({ pathname: "/account", params: { next: "pro" } })}>
                <Text style={styles.signInHint}>
                  Sign in first so Pro also works on the web and your other devices.
                </Text>
              </Pressable>
            )}

            <Pressable
              style={[styles.primaryBtn, (busy || !offer) && styles.disabled]}
              onPress={() => offer && purchase(offer)}
              disabled={busy || !offer}
            >
              <Text style={styles.primaryText}>
                {busy ? "Working..." : `Subscribe for ${offer?.price} / ${offer?.plan === "annual" ? "year" : "month"}`}
              </Text>
            </Pressable>
          </>
        )}

        {notice && <Text style={styles.notice}>{notice}</Text>}
        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable onPress={restore} disabled={busy} style={styles.restoreBtn}>
          <Text style={styles.restoreText}>Restore purchases</Text>
        </Pressable>

        <Text style={styles.terms}>
          MolDock Pro is an auto-renewing subscription
          {monthly && annual ? ` (${monthly.price} per month or ${annual.price} per year)` : ""}.
          Payment is charged to your {STORE_ACCOUNT} when you confirm the purchase. The subscription
          renews automatically for the same period and price unless it is cancelled at least 24
          hours before the end of the current period; your account is charged for the renewal
          within the 24 hours before the period ends. You can manage or cancel it at any time{" "}
          {MANAGE_WHERE}. Cancelling keeps Pro until the end of the period you've paid for.
        </Text>

        <View style={styles.legalRow}>
          <Pressable onPress={() => open(PRIVACY_URL)}>
            <Text style={styles.legalLink}>Privacy Policy</Text>
          </Pressable>
          <Text style={styles.legalSep}>|</Text>
          <Pressable onPress={() => open(IS_IOS ? APPLE_EULA_URL : PLAY_TERMS_URL)}>
            <Text style={styles.legalLink}>Terms of Use (EULA)</Text>
          </Pressable>
        </View>
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
    gap: 12,
    maxWidth: 600,
    alignSelf: "center",
    width: "100%",
  },
  heading: { fontSize: 32, fontWeight: "200", color: "#fff", textAlign: "center" },
  headingBold: { fontWeight: "600" },
  sub: { fontSize: 13, color: "#9ca3af", textAlign: "center", marginBottom: 12 },
  card: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  featureText: { color: "#e5e7eb", fontSize: 13, flex: 1 },
  activeTitle: { color: "#fff", fontSize: 16, fontWeight: "500" },
  meta: { color: "#6b7280", fontSize: 12, lineHeight: 18, textAlign: "center" },
  planCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  planCardActive: { borderColor: "#fff" },
  planName: { color: "#fff", fontSize: 15, fontWeight: "500" },
  planPrice: { color: "#9ca3af", fontSize: 13, marginTop: 2 },
  signInHint: { color: "#9ca3af", fontSize: 12, textAlign: "center", textDecorationLine: "underline" },
  primaryBtn: {
    backgroundColor: "#fff",
    paddingVertical: 14,
    borderRadius: 50,
    alignItems: "center",
    marginTop: 4,
  },
  primaryText: { color: "#000", fontSize: 14, fontWeight: "500" },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    paddingVertical: 12,
    borderRadius: 50,
    alignItems: "center",
  },
  secondaryText: { color: "#fff", fontSize: 13 },
  disabled: { opacity: 0.3 },
  notice: { color: "#86efac", fontSize: 12, textAlign: "center" },
  error: { color: "#f87171", fontSize: 12, textAlign: "center" },
  restoreBtn: { alignSelf: "center", paddingVertical: 8 },
  restoreText: { color: "#9ca3af", fontSize: 13 },
  terms: { color: "#4b5563", fontSize: 10, lineHeight: 15, textAlign: "center" },
  legalRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10 },
  legalLink: { color: "#9ca3af", fontSize: 11, textDecorationLine: "underline" },
  legalSep: { color: "#4b5563", fontSize: 11 },
});
