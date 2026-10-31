import { useState, useEffect, useRef } from "react";
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Spinner from "@/components/Spinner";
import { BarButton, BoxedInput, GlyphTile, KeyValue, Message, Panel, ScreenHeading } from "@/components/Bauhaus";
import { getJobStatus } from "@/lib/api";
import { palette, type, space, rule, fonts, maxContent } from "@/lib/theme";

const statusLabel: Record<string, string> = {
  queued: "In Queue",
  preparing: "Preparing",
  docking: "Docking",
  completed: "Done",
  failed: "Failed",
};

export default function Dashboard() {
  const router = useRouter();
  const { jobId: paramJobId } = useLocalSearchParams<{ jobId?: string }>();

  const [jobId, setJobId] = useState(paramJobId ?? "");
  const [inputId, setInputId] = useState("");
  const [job, setJob] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (paramJobId) setJobId(paramJobId);
  }, [paramJobId]);

  useEffect(() => {
    if (!jobId) return;

    const poll = async () => {
      try {
        const data = await getJobStatus(jobId);
        setJob(data);
        if (data.status === "completed" || data.status === "failed") {
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      } catch {
        setError("Job not found.");
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [jobId]);

  if (!jobId) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom", "left", "right"]}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ScreenHeading title="Track a job" subtitle="Paste the job ID from your confirmation email." />
          <BoxedInput
            icon="pricetag-outline"
            value={inputId}
            onChangeText={setInputId}
            onSubmitEditing={() => {
              if (inputId.trim()) setJobId(inputId.trim());
            }}
            placeholder="Job ID"
            autoCapitalize="none"
            returnKeyType="go"
          />
          <BarButton
            title="Open job"
            icon="arrow-forward"
            kind="action"
            disabled={!inputId.trim()}
            onPress={() => setJobId(inputId.trim())}
            style={{ marginTop: 12 }}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const running = job && job.status !== "completed" && job.status !== "failed";
  const lines: string[] = job?.status_message ? job.status_message.split("\n").filter(Boolean) : [];

  return (
    <SafeAreaView style={styles.safe} edges={["bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeading eyebrow={`Job ${jobId.slice(0, 8)}`} title={job ? `${job.protein_pdb_id?.toUpperCase()} + ${job.ligand_name}` : "Docking job"} />

        {error && <Message kind="error" text={error} />}
        {!job && !error && <Spinner />}

        {job && (
          <View style={{ gap: 12 }}>
            {/* Status */}
            {job.status === "completed" ? (
              <Panel fill={palette.blue} style={styles.statusRow}>
                <GlyphTile icon="checkmark" fill={palette.ground} />
                <Text style={[styles.statusText, { color: palette.ground }]}>Complete</Text>
              </Panel>
            ) : job.status === "failed" ? (
              <Message kind="error" text={job.error_message || "This docking job failed."} />
            ) : (
              <Panel fill={palette.yellow} style={{ gap: 10 }}>
                <View style={styles.statusRow}>
                  <ActivityIndicator color={palette.ink} />
                  <Text style={styles.statusText}>{statusLabel[job.status] || job.status}</Text>
                </View>
                {lines[0] ? <Text style={type.mono}>{lines[0]}</Text> : null}
              </Panel>
            )}
            {running && lines.length > 1 && (
              <View style={styles.logBox}>
                {lines.slice(1).map((line, i) => (
                  <Text key={i} style={[type.mono, { fontSize: 11, lineHeight: 17, color: palette.inkSecondary }]}>
                    {line}
                  </Text>
                ))}
              </View>
            )}

            {/* Details */}
            <Panel style={{ paddingVertical: 4 }}>
              <KeyValue label="Protein" value={job.protein_pdb_id?.toUpperCase()} />
              <KeyValue label="Ligand" value={job.ligand_name} />
              <KeyValue label="Submitted" value={new Date(job.created_at).toLocaleString()} last={job.best_affinity == null} />
              {job.best_affinity != null && <KeyValue label="Best affinity" value={`${job.best_affinity} kcal/mol`} last />}
            </Panel>

            {job.status === "completed" && (
              <BarButton
                title="View results"
                icon="cube-outline"
                kind="action"
                onPress={() => router.push({ pathname: "/results/[jobId]", params: { jobId } })}
              />
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.ground },
  content: { padding: space.m, paddingBottom: space.xl, maxWidth: maxContent, alignSelf: "center", width: "100%" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  statusText: { fontFamily: fonts.bold, fontSize: 20, color: palette.ink, textTransform: "uppercase", letterSpacing: 1 },
  logBox: { backgroundColor: palette.groundSoft, padding: 10, borderWidth: rule.thin, borderColor: palette.ink, maxHeight: 160 },
});
