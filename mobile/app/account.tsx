import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import Spinner from "@/components/Spinner";
import { useAccount } from "@/lib/AccountContext";
import { errorText, isPaid, requestSignInCode, verifySignInCode } from "@/lib/account";
import { manageSubscriptions } from "@/lib/purchases";

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
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Account</Text>

        {account?.signed_in && (
          <View style={styles.card}>
            <Text style={styles.label}>Signed in as</Text>
            <Text style={styles.value}>{account.email ?? "This device (no email yet)"}</Text>
            <View style={styles.divider} />
            <Text style={styles.label}>Plan</Text>
            <Text style={styles.value}>{TIER_LABEL[account.tier] ?? account.tier}</Text>
            <Text style={styles.meta}>
              {account.usage.used_today} of {account.usage.jobs_per_day} dockings used today
            </Text>
            {isPaid(account) ? (
              <Pressable style={styles.secondaryBtn} onPress={manage}>
                <Text style={styles.secondaryText}>Manage subscription</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.primaryBtn} onPress={() => router.push("/pro")}>
                <Text style={styles.primaryText}>Upgrade to MolDock Pro</Text>
              </Pressable>
            )}
          </View>
        )}

        {!hasEmail && (
          <View style={styles.card}>
            <Text style={styles.title}>
              {account?.signed_in ? "Add your email" : "Sign in with email"}
            </Text>
            <Text style={styles.body}>
              Your MolDock account carries your plan to the web app and your other devices. No
              password: we email you a link and a 6-digit code.
            </Text>

            {step === "email" ? (
              <>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@university.edu"
                  placeholderTextColor="#4b5563"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="emailAddress"
                  returnKeyType="send"
                  onSubmitEditing={sendCode}
                />
                <Pressable
                  style={[styles.primaryBtn, working && styles.disabled]}
                  onPress={sendCode}
                  disabled={working}
                >
                  <Text style={styles.primaryText}>{working ? "Sending..." : "Email me a code"}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.meta}>
                  Sent to {email}. Tap the link in the email on this phone, or enter the code.
                </Text>
                <TextInput
                  style={[styles.input, styles.codeInput]}
                  value={code}
                  onChangeText={(t) => setCode(t.replace(/[^0-9]/g, "").slice(0, 6))}
                  placeholder="123456"
                  placeholderTextColor="#4b5563"
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  returnKeyType="done"
                  onSubmitEditing={submitCode}
                />
                <Pressable
                  style={[styles.primaryBtn, (working || code.length !== 6) && styles.disabled]}
                  onPress={submitCode}
                  disabled={working || code.length !== 6}
                >
                  <Text style={styles.primaryText}>{working ? "Checking..." : "Sign in"}</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setStep("email");
                    setCode("");
                    setError(null);
                  }}
                >
                  <Text style={styles.link}>Use a different email</Text>
                </Pressable>
              </>
            )}
            {error && <Text style={styles.error}>{error}</Text>}
          </View>
        )}

        {account?.signed_in && (
          <Pressable onPress={signOut}>
            <Text style={styles.signOut}>Sign out</Text>
          </Pressable>
        )}
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
    gap: 16,
    maxWidth: 600,
    alignSelf: "center",
    width: "100%",
  },
  heading: {
    fontSize: 32,
    fontWeight: "200",
    color: "#fff",
    textAlign: "center",
    marginBottom: 16,
  },
  card: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    padding: 20,
    gap: 8,
  },
  title: { color: "#fff", fontSize: 16, fontWeight: "500" },
  body: { color: "#9ca3af", fontSize: 13, lineHeight: 20 },
  label: { color: "#6b7280", fontSize: 11 },
  value: { color: "#fff", fontSize: 15 },
  meta: { color: "#6b7280", fontSize: 12, lineHeight: 18 },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginVertical: 8 },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.15)",
    paddingVertical: 10,
    fontSize: 15,
    color: "#fff",
    marginVertical: 8,
  },
  codeInput: { fontSize: 24, letterSpacing: 8, textAlign: "center" },
  primaryBtn: {
    backgroundColor: "#fff",
    paddingVertical: 14,
    borderRadius: 50,
    alignItems: "center",
    marginTop: 8,
  },
  primaryText: { color: "#000", fontSize: 14, fontWeight: "500" },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    paddingVertical: 12,
    borderRadius: 50,
    alignItems: "center",
    marginTop: 8,
  },
  secondaryText: { color: "#fff", fontSize: 13 },
  disabled: { opacity: 0.3 },
  link: { color: "#9ca3af", fontSize: 12, textAlign: "center", marginTop: 12 },
  error: { color: "#f87171", fontSize: 12, textAlign: "center", marginTop: 8 },
  signOut: { color: "#6b7280", fontSize: 12, textAlign: "center", marginTop: 8 },
});
