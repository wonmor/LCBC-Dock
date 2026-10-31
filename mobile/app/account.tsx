import { useState } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import Spinner from "@/components/Spinner";
import { BarButton, BoxedInput, KeyValue, Message, Panel, ScreenHeading, SectionTitle, TextLink } from "@/components/Bauhaus";
import { useAccount } from "@/lib/AccountContext";
import { errorText, isPaid, requestSignInCode, verifySignInCode } from "@/lib/account";
import { manageSubscriptions } from "@/lib/purchases";
import { palette, type, space, maxContent } from "@/lib/theme";

const WEB_ACCOUNT_URL = "https://lcbc-client.apps.johnseong.com/account";

const TIER_LABEL: Record<string, string> = {
  anonymous: "Not signed in",
  free: "Free",
  pro: "Pro",
  lab: "Lab / Institution",
};

export default function Account() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { ready, account, signIn, signOut } = useAccount();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasEmail = !!account?.email;

  const sendCode = async () => {
    const value = email.trim().toLowerCase();
    if (!value.includes("@")) {
      setError("Enter your email address.");
      return;
    }
    setWorking(true);
    setError(null);
    try {
      await requestSignInCode(value);
      setEmail(value);
      setStep("code");
    } catch (e) {
      setError(errorText(e, "Couldn't send the sign-in email. Try again."));
    } finally {
      setWorking(false);
    }
  };

  const submitCode = async () => {
    setWorking(true);
    setError(null);
    try {
      const token = await verifySignInCode(email, code);
      await signIn(token);
      setCode("");
      setStep("email");
      if (next === "pro") router.replace("/pro");
    } catch (e) {
      setError(errorText(e, "That code didn't work. Request a new one."));
    } finally {
      setWorking(false);
    }
  };

  const manage = async () => {
    const sources = account?.sources ?? [];
    if (sources.includes("app_store") || sources.includes("google_play")) {
      await manageSubscriptions().catch(() => {});
    } else {
      await WebBrowser.openBrowserAsync(WEB_ACCOUNT_URL);
    }
  };

  if (!ready) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <Spinner />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeading title="Account" subtitle={account?.signed_in ? undefined : "Sign in to carry your plan across devices."} />

        {account?.signed_in && (
          <View style={{ gap: 12 }}>
            <Panel style={{ paddingVertical: 4 }}>
              <KeyValue label="Signed in as" value={account.email ?? "This device (no email yet)"} />
              <KeyValue label="Plan" value={TIER_LABEL[account.tier] ?? account.tier} />
              <KeyValue label="Today" value={`${account.usage.used_today} of ${account.usage.jobs_per_day} dockings`} last />
            </Panel>
            {isPaid(account) ? (
              <BarButton title="Manage subscription" icon="settings-outline" kind="secondary" onPress={manage} />
            ) : (
              <BarButton title="Upgrade to MolDock Pro" icon="star" kind="pro" onPress={() => router.push("/pro")} />
            )}
          </View>
        )}

        {!hasEmail && (
          <View style={{ gap: 12, marginTop: account?.signed_in ? space.xl : 0 }}>
            <SectionTitle title={account?.signed_in ? "Add your email" : "Sign in with email"} />
            <Text style={type.body}>
              Your MolDock account carries your plan to the web app and your other devices. No password: we email
              you a link and a 6-digit code.
            </Text>

            {step === "email" ? (
              <>
                <BoxedInput
                  icon="mail-outline"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@university.edu"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="emailAddress"
                  returnKeyType="send"
                  onSubmitEditing={sendCode}
                />
                <BarButton title={working ? "Sending..." : "Email me a code"} icon="send" kind="action" onPress={sendCode} disabled={working} />
              </>
            ) : (
              <>
                <Text style={type.caption}>Sent to {email}. Tap the link in the email on this device, or enter the code.</Text>
                <BoxedInput
                  large
                  value={code}
                  onChangeText={(t) => setCode(t.replace(/[^0-9]/g, "").slice(0, 6))}
                  placeholder="123456"
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  returnKeyType="done"
                  onSubmitEditing={submitCode}
                />
                <BarButton
                  title={working ? "Checking..." : "Sign in"}
                  icon="log-in-outline"
                  kind="action"
                  onPress={submitCode}
                  disabled={working || code.length !== 6}
                />
                <TextLink
                  title="Use a different email"
                  onPress={() => {
                    setStep("email");
                    setCode("");
                    setError(null);
                  }}
                />
              </>
            )}
            {error && <Message kind="error" text={error} />}
          </View>
        )}

        {account?.signed_in && (
          <View style={{ marginTop: space.xl }}>
            <TextLink title="Sign out" icon="log-out-outline" onPress={signOut} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.ground },
  content: { padding: space.m, paddingBottom: space.xl, maxWidth: maxContent, alignSelf: "center", width: "100%" },
});
