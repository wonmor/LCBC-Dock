import { useState, useEffect, useRef } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Spinner from "@/components/Spinner";
import { getJobStatus } from "@/lib/api";

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
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.container}>
          <Text style={styles.heading}>Dashboard</Text>
          <TextInput
            style={styles.input}
            value={inputId}
            onChangeText={setInputId}
            onSubmitEditing={() => {
              if (inputId.trim()) setJobId(inputId.trim());
            }}
            placeholder="Paste job ID..."
            placeholderTextColor="#4b5563"
            autoCapitalize="none"
            returnKeyType="go"
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <View style={styles.container}>
        <Text style={styles.heading}>Dashboard</Text>
        <Text style={styles.jobIdText}>{jobId.slice(0, 8)}...</Text>

        {error && <Text style={styles.error}>{error}</Text>}
        {!job && !error && <Spinner />}

        {job && (
          <View style={styles.cardStack}>
            {/* Status */}
            <View style={styles.card}>
              {job.status === "completed" ? (
                <Text style={styles.statusDone}>Complete</Text>
              ) : job.status === "failed" ? (
                <Text style={styles.statusFailed}>Failed</Text>
              ) : (
                <View style={{ alignItems: "center" }}>
                  <Spinner label={statusLabel[job.status] || job.status} />
                  {job.status_message ? (
                    <Text style={styles.statusMsg}>{job.status_message}</Text>
                  ) : null}
                </View>
              )}
            </View>

            {/* Details */}
            <View style={styles.card}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Protein</Text>
                <Text style={styles.detailValue}>
                  {job.protein_pdb_id?.toUpperCase()}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Ligand</Text>
                <Text style={styles.detailValue}>{job.ligand_name}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Submitted</Text>
                <Text style={styles.detailValue}>
                  {new Date(job.created_at).toLocaleString()}
                </Text>
              </View>
              {job.best_affinity != null && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Best Affinity</Text>
                  <Text style={styles.affinityValue}>
                    {job.best_affinity} kcal/mol
                  </Text>
                </View>
              )}
            </View>

            {job.status === "completed" && (
              <Pressable
                style={styles.viewBtn}
                onPress={() =>
                  router.push({
                    pathname: "/results/[jobId]",
                    params: { jobId },
                  })
                }
              >
                <Text style={styles.viewBtnText}>View Results</Text>
              </Pressable>
            )}

            {job.status === "failed" && job.error_message && (
              <Text style={styles.error}>{job.error_message}</Text>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    maxWidth: 600,
    alignSelf: "center",
    width: "100%",
  },
  heading: {
    fontSize: 32,
    fontWeight: "200",
    color: "#fff",
    textAlign: "center",
    marginBottom: 4,
  },
  jobIdText: {
    fontSize: 11,
    color: "#6b7280",
    textAlign: "center",
    fontFamily: "monospace",
    marginBottom: 32,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    color: "#fff",
    marginTop: 24,
  },
  error: {
    color: "#f87171",
    fontSize: 12,
    textAlign: "center",
  },
  cardStack: { gap: 12 },
  card: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    padding: 20,
  },
  statusDone: {
    color: "#4ade80",
    fontSize: 18,
    fontWeight: "300",
    textAlign: "center",
  },
  statusFailed: {
    color: "#f87171",
    fontSize: 18,
    fontWeight: "300",
    textAlign: "center",
  },
  statusMsg: {
    color: "#6b7280",
    fontSize: 11,
    fontFamily: "monospace",
    textAlign: "center",
    marginTop: 8,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  detailLabel: {
    color: "#6b7280",
    fontSize: 12,
  },
  detailValue: {
    color: "#fff",
    fontSize: 12,
  },
  affinityValue: {
    color: "#4ade80",
    fontSize: 12,
    fontWeight: "500",
  },
  viewBtn: {
    backgroundColor: "#fff",
    paddingVertical: 14,
    borderRadius: 50,
    alignItems: "center",
  },
  viewBtnText: {
    color: "#000",
    fontSize: 14,
    fontWeight: "500",
  },
});
