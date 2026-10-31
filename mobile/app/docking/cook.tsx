import { useState } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Slider from "@react-native-community/slider";
import StepIndicator from "@/components/StepIndicator";
import { BarButton, BottomBar, BoxedInput, IconButton, Message, Panel, ScreenHeading, SectionTitle } from "@/components/Bauhaus";
import { submitDockingJob } from "@/lib/api";
import { useAccount } from "@/lib/AccountContext";
import { errorText, isPaid, paywallOf } from "@/lib/account";
import { palette, type, space, rule, fonts, maxContent } from "@/lib/theme";

export default function Cook() {
  const router = useRouter();
  const { proteinState, ligandCid, ligandName } = useLocalSearchParams<{
    proteinState: string;
    ligandCid: string;
    ligandName: string;
  }>();

  const [email, setEmail] = useState("");
  const [exhaustiveness, setExhaustiveness] = useState(4);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upsell, setUpsell] = useState(false);
  const { account, refresh } = useAccount();
  // Limits are enforced by the server; this only explains them up front.
  const maxExh = account?.limits.max_exhaustiveness ?? 8;
  const capped = exhaustiveness > maxExh;

  const handleSubmit = async () => {
    if (!proteinState || !ligandCid) return;
    setSubmitting(true);
    setError(null);
    setUpsell(false);

    try {
      const data = await submitDockingJob({
        protein_pdb_id: proteinState,
        ligand_cid: parseInt(ligandCid),
        ligand_name: ligandName ?? "",
        exhaustiveness,
        email: email || undefined,
      });
      refresh();
      router.replace({
        pathname: "/dashboard",
        params: { jobId: data.job_id },
      });
    } catch (err: any) {
      setError(errorText(err, "Failed to submit. Is the backend running?"));
      const pw = paywallOf(err);
      setUpsell(!!pw && !isPaid(account) && pw.code !== "invalid_params");
      setSubmitting(false);
    }
  };

  const protein = (proteinState ?? "").toUpperCase();

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeading eyebrow="Step 4 of 4" title="Dock" subtitle={`${protein} + ${ligandName ?? ""}`} />

        {/* Summary */}
        <View style={styles.pair}>
          <View style={[styles.pairCell, { backgroundColor: palette.ink }]}>
            <Text style={[type.label, { color: palette.ground }]}>Protein</Text>
            <Text style={[styles.pairValue, { color: palette.ground }]} numberOfLines={1} adjustsFontSizeToFit>
              {protein}
            </Text>
          </View>
          <View style={[styles.pairCell, styles.pairRight]}>
            <Text style={type.label}>Ligand</Text>
            <Text style={styles.pairValue} numberOfLines={1} adjustsFontSizeToFit>
              {ligandName}
            </Text>
          </View>
        </View>

        {/* Exhaustiveness */}
        <SectionTitle title="Exhaustiveness" accessory={<Text style={styles.exhValue}>{exhaustiveness}</Text>} />
        <Slider
          minimumValue={1}
          maximumValue={32}
          step={1}
          value={exhaustiveness}
          onValueChange={setExhaustiveness}
          minimumTrackTintColor={palette.blue}
          maximumTrackTintColor={palette.ink}
          thumbTintColor={palette.blue}
          accessibilityLabel="Exhaustiveness"
        />
        <View style={styles.scale}>
          <Text style={type.label}>1 Faster</Text>
          <Text style={type.label}>32 More thorough</Text>
        </View>
        <Text style={[type.caption, { marginTop: space.s }]}>
          Higher values search more poses and take longer. 4 gives quick results.
        </Text>
        {capped && (
          <View style={{ marginTop: 12 }}>
            <Message
              kind="attention"
              text={`Your plan runs up to ${maxExh}, so this job will use ${maxExh}.${isPaid(account) ? "" : " MolDock Pro goes up to 32."}`}
              onPress={isPaid(account) ? undefined : () => router.push("/pro")}
            />
          </View>
        )}

        {/* Email */}
        <View style={{ marginTop: space.xl }}>
          <SectionTitle title="Email (optional)" />
          <BoxedInput
            icon="mail-outline"
            value={email}
            onChangeText={setEmail}
            placeholder="Notify me when it's done"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={{ gap: 12, marginTop: space.l }}>
          {error && <Message kind="error" text={error} />}
          {upsell && <BarButton title="See MolDock Pro" icon="star" kind="pro" onPress={() => router.push("/pro")} />}

          <BarButton
            title={submitting ? "Submitting..." : "Start docking"}
            icon="play"
            kind="action"
            onPress={handleSubmit}
            disabled={submitting || !proteinState || !ligandCid}
          />

          <Text style={[type.caption, { textAlign: "center" }]}>
            The grid box is centred on the protein automatically. Powered by AutoDock Vina.
          </Text>
        </View>
      </ScrollView>

      <BottomBar>
        <StepIndicator current={3} />
        <IconButton icon="arrow-back" label="Back" onPress={() => router.back()} />
      </BottomBar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.ground },
  content: { padding: space.m, paddingBottom: space.xl, maxWidth: maxContent, alignSelf: "center", width: "100%" },
  pair: { flexDirection: "row", borderWidth: rule.regular, borderColor: palette.ink, marginBottom: space.xl },
  pairCell: { flex: 1, padding: 12, gap: 2 },
  pairRight: { borderLeftWidth: rule.regular, borderLeftColor: palette.ink },
  pairValue: { fontFamily: fonts.bold, fontSize: 22, color: palette.ink },
  exhValue: { fontFamily: fonts.bold, fontSize: 22, color: palette.blue },
  scale: { flexDirection: "row", justifyContent: "space-between" },
});
