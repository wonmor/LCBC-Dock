"use client";

import { FC, useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import axios from "axios";
import Link from "next/link";
import { RotatingTriangles } from "react-loader-spinner";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";

const API_BASE =
  process.env.NODE_ENV === "development"
    ? "http://localhost:8000"
    : "https://api.lcbcdock.com";

interface JobInfo {
  job_id: string;
  status: string;
  protein_pdb_id: string;
  ligand_cid: number;
  ligand_name: string;
  email?: string;
  created_at: string;
  completed_at?: string;
  error_message?: string;
  best_affinity?: number;
  num_poses?: number;
  queue_position?: number;
}

const statusLabels: Record<string, string> = {
  queued: "In Queue",
  preparing: "Preparing Molecules",
  docking: "Running AutoDock Vina",
  completed: "Completed",
  failed: "Failed",
};

const statusColors: Record<string, string> = {
  queued: "text-yellow-300",
  preparing: "text-blue-300",
  docking: "text-purple-300",
  completed: "text-green-300",
  failed: "text-red-300",
};

const Dashboard: FC = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const jobId = searchParams.get("jobId") ?? "";

  const [job, setJob] = useState<JobInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const fetchStatus = async () => {
      try {
        const resp = await axios.get(`${API_BASE}/api/jobs/${jobId}`);
        setJob(resp.data);

        if (
          resp.data.status === "completed" ||
          resp.data.status === "failed"
        ) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      } catch (err: any) {
        setError("Could not fetch job status. Please check your job ID.");
      }
    };

    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 3000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [jobId]);

  if (!jobId) {
    return (
      <main className="pb-40">
        <div className="text-center">
          <h1 className="text-6xl font-thin mb-6">
            <span className="font-semibold">DASHBOARD</span>
          </h1>
          <p className="text-gray-400 mb-8">
            Enter a job ID to track your docking job.
          </p>
          <div className="max-w-md mx-auto">
            <input
              type="text"
              placeholder="Paste your job ID here..."
              className="w-full bg-gray-800 rounded-lg p-3 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const val = (e.target as HTMLInputElement).value.trim();
                  if (val) router.push(`/dashboard?jobId=${val}`);
                }
              }}
            />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="pb-40">
      <div className="text-center mb-8">
        <h1 className="text-6xl font-thin mb-2">
          <span className="font-semibold">DASHBOARD</span>
        </h1>
        <p className="text-sm font-mono text-gray-400">
          Job: {jobId.slice(0, 8)}...
        </p>
      </div>

      {error && (
        <div className="max-w-lg mx-auto bg-red-900/50 border border-red-500 rounded-xl p-4 text-red-300 text-center">
          {error}
        </div>
      )}

      {!job && !error && (
        <div className="flex flex-col items-center gap-4">
          <RotatingTriangles />
          <p>Loading job status...</p>
        </div>
      )}

      {job && (
        <div className="max-w-lg mx-auto flex flex-col gap-6">
          {/* Status Banner */}
          <div className="bg-gray-900 rounded-2xl p-8 text-center">
            {job.status === "completed" ? (
              <CheckCircleIcon
                className="text-green-300"
                style={{ fontSize: 80 }}
              />
            ) : job.status === "failed" ? (
              <ErrorIcon className="text-red-300" style={{ fontSize: 80 }} />
            ) : (
              <RotatingTriangles
                width="80"
                height="80"
                ariaLabel="loading"
              />
            )}

            <h2
              className={`text-2xl font-semibold mt-4 ${
                statusColors[job.status] || "text-white"
              }`}
            >
              {statusLabels[job.status] || job.status}
            </h2>

            {job.status === "queued" && job.queue_position && (
              <p className="text-gray-400 mt-2">
                Queue position: <span className="text-white font-mono">{job.queue_position}</span>
              </p>
            )}

            {job.status === "docking" && (
              <p className="text-gray-400 mt-2">
                AutoDock Vina is running. This may take a few minutes...
              </p>
            )}
          </div>

          {/* Job Details */}
          <div className="bg-gray-900 rounded-2xl p-6">
            <h3 className="text-lg font-semibold mb-4 text-blue-300">
              Job Details
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-400">Protein</span>
                <p className="font-mono text-lg">
                  {job.protein_pdb_id.toUpperCase()}
                </p>
              </div>
              <div>
                <span className="text-gray-400">Ligand</span>
                <p>{job.ligand_name}</p>
                <p className="text-xs text-gray-500">CID: {job.ligand_cid}</p>
              </div>
              <div>
                <span className="text-gray-400">Submitted</span>
                <p className="text-xs">
                  {new Date(job.created_at).toLocaleString()}
                </p>
              </div>
              {job.completed_at && (
                <div>
                  <span className="text-gray-400">Completed</span>
                  <p className="text-xs">
                    {new Date(job.completed_at).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Results Preview */}
          {job.status === "completed" && (
            <div className="bg-gray-900 rounded-2xl p-6">
              <h3 className="text-lg font-semibold mb-4 text-green-300">
                Results
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm mb-6">
                <div>
                  <span className="text-gray-400">Best Binding Affinity</span>
                  <p className="text-2xl font-semibold text-green-300">
                    {job.best_affinity} kcal/mol
                  </p>
                </div>
                <div>
                  <span className="text-gray-400">Poses Generated</span>
                  <p className="text-2xl font-semibold">{job.num_poses}</p>
                </div>
              </div>

              <Link
                href={`/results/${job.job_id}`}
                className="block w-full bg-green-400 hover:bg-green-500 text-black font-semibold
                           py-3 rounded-xl text-center text-lg transition-colors"
              >
                View Docked Pose
              </Link>
            </div>
          )}

          {/* Error Message */}
          {job.status === "failed" && job.error_message && (
            <div className="bg-red-900/30 border border-red-500/50 rounded-2xl p-6">
              <h3 className="text-lg font-semibold mb-2 text-red-300">Error</h3>
              <p className="text-sm text-red-200 font-mono">
                {job.error_message}
              </p>
              <Link
                href="/docking/protein"
                className="inline-block mt-4 text-blue-300 hover:text-blue-400 text-sm"
              >
                Try again with different parameters
              </Link>
            </div>
          )}

          {job.email && (
            <p className="text-center text-xs text-gray-500">
              {job.status === "completed" || job.status === "failed"
                ? `A notification was sent to ${job.email}`
                : `We'll notify ${job.email} when this job completes.`}
            </p>
          )}
        </div>
      )}
    </main>
  );
};

export default Dashboard;
