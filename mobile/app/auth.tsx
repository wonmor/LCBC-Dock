import { useEffect, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Spinner from "@/components/Spinner";
import { Message, TextLink } from "@/components/Bauhaus";
import { useAccount } from "@/lib/AccountContext";
import { errorText, verifySignInLink } from "@/lib/account";
import { palette, space } from "@/lib/theme";

// dockit://auth?token=... (opened from the sign-in email via the web
// verify page). The token is one-shot, so it is spent exactly once.
export default function AuthLink() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { ready, signIn } = useAccount();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    if (!token) {
      setError("This sign-in link is incomplete.");
      return;
    }
    verifySignInLink(token)
      .then((session) => signIn(session))
      .then(() => router.replace("/account"))
      .catch((e) => setError(errorText(e, "This sign-in link is invalid, used or expired.")));
  }, [ready, token, signIn, router]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {error ? (
          <>
            <Message kind="error" text={error} />
            <TextLink title="Request a new code" onPress={() => router.replace("/account")} />
          </>
        ) : (
          <Spinner label="Signing you in..." />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.ground },
  container: { flex: 1, justifyContent: "center", paddingHorizontal: space.m, gap: space.m },
});
