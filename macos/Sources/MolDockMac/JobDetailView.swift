import SwiftUI
import AppKit

/// One docking job: live status while it runs, then the full result
/// (3D view, poses, redocking RMSD, interactions, downloads). Mirrors
/// app/dashboard (status) and app/results/[jobId].
struct JobDetailView: View {
    let jobID: String

    @EnvironmentObject private var app: AppModel
    @State private var status: JobStatus?
    @State private var result: DockResult?
    @State private var error: ShownError?

    var body: some View {
        ScrollViewReader { proxy in
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let result {
                    ResultContent(result: result)
                        #if DEBUG
                        .task {
                            // QA hook: -MolDockScrollTo poses|interactions|downloads
                            if let target = UserDefaults.standard.string(forKey: "MolDockScrollTo") {
                                try? await Task.sleep(nanoseconds: 4_000_000_000)
                                proxy.scrollTo(target, anchor: .top)
                            }
                        }
                        #endif
                } else if let status {
                    statusCard(status)
                } else if let error {
                    ErrorLine(error: error)
                } else {
                    ProgressView("Loading job...")
                }
            }
            .frame(maxWidth: 900, alignment: .leading)
            .padding(32)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        }
        .navigationTitle(result.map { "\($0.ligandName) + \($0.proteinPdbId)" } ?? "Docking job")
        .task(id: jobID) { await poll() }
    }

    private func statusCard(_ s: JobStatus) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            PageTitle(title: "\(s.ligandName) + \(s.proteinPdbId)", subtitle: "Job \(s.jobId.prefix(8))")
            Card {
                HStack(spacing: 14) {
                    if !s.isFinished { ProgressView().controlSize(.small) }
                    Text(Format.statusLabel(s.status)).font(.system(.title2, design: .rounded).weight(.medium))
                }
                if s.status == "queued", let q = s.queuePosition, q > 0 {
                    Text("Position \(q) in the queue.").foregroundColor(.secondary)
                }
                if let m = s.statusMessage, !m.isEmpty, !s.isFinished {
                    Text(m).foregroundColor(.secondary)
                }
                if s.status == "failed" {
                    Text(s.errorMessage ?? "The docking failed.").foregroundColor(.red)
                    Button("Dock again") {
                        app.dock(DockDraft(protein: s.proteinPdbId, ligandCid: s.ligandCid ?? 0, ligandName: s.ligandName))
                    }
                    .disabled((s.ligandCid ?? 0) == 0)
                } else {
                    Text("This page updates on its own. You can leave it; the job keeps running and appears under Results.")
                        .font(.caption).foregroundColor(.secondary)
                }
            }
        }
    }

    private func poll() async {
        status = nil
        result = nil
        error = nil
        while !Task.isCancelled {
            do {
                let s: JobStatus = try await Backend.get("/api/jobs/\(jobID)")
                status = s
                if s.status == "completed" {
                    result = try await Backend.get("/api/results/\(jobID)", timeout: 60)
                    return
                }
                if s.status == "failed" { return }
            } catch {
                let f = error as? Backend.Failure
                if f?.status == 404 {
                    self.error = ShownError(message: "This job doesn't exist any more, or it's private to another account.")
                    return
                }
                if status == nil { self.error = ShownError(error, fallback: "Couldn't load this job.") }
            }
            try? await Task.sleep(nanoseconds: 3_000_000_000)
        }
    }
}

private struct ResultContent: View {
    let result: DockResult

    @EnvironmentObject private var app: AppModel
    @State private var pose = 1
    @State private var proteinAtoms: [Atom] = []
    @State private var loadingProtein = true
    @State private var interactions: Interactions?
    @State private var interactionsLocked = false
    @State private var diagram: NSImage?
    @State private var downloading: String?
    @State private var downloadError: String?

    private var poseBlocks: [String] { PDBParser.models(result.dockedPdb ?? "") }

    private var ligandAtoms: [Atom] {
        if pose - 1 < result.poses.count, let q = result.poses[pose - 1].pdbqt, !q.isEmpty {
            return PDBParser.atoms(q)
        }
        let blocks = poseBlocks
        return pose - 1 < blocks.count ? PDBParser.atoms(blocks[pose - 1]) : []
    }

    private var lockedPoses: Set<Int> {
        Set((result.analysis?.poses ?? []).enumerated().compactMap { $0.element?.locked == true ? $0.offset + 1 : nil })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header
            viewer
            posesTable.id("poses")
            if let rmsd = result.analysis?.rmsd { rmsdCard(rmsd) }
            interactionsCard.id("interactions")
            downloadsCard.id("downloads")
            if let methods = result.methods, !methods.isEmpty {
                Card(title: "Methods") {
                    Text(methods).textSelection(.enabled).foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .task(id: result.jobId) { await loadProtein() }
        .task(id: "\(result.jobId)-\(pose)") { await loadInteractions() }
    }

    private var header: some View {
        HStack(alignment: .bottom) {
            PageTitle(title: "\(result.ligandName) + \(result.proteinPdbId)",
                      subtitle: "Job \(result.jobId.prefix(8))\(result.visibility == "private" ? " | Private" : "")")
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text("\(Format.kcal(result.bestAffinity)) kcal/mol")
                    .font(.system(.title, design: .rounded).weight(.semibold))
                Text("best binding affinity").font(.caption).foregroundColor(.secondary)
            }
        }
    }

    private var viewer: some View {
        Card {
            HStack {
                Text("3D view").font(.system(.headline, design: .rounded))
                Spacer()
                Picker("Pose", selection: $pose) {
                    ForEach(result.poses) { p in
                        Text("Pose \(p.model)  \(Format.kcal(p.affinity))").tag(p.model)
                    }
                }
                .frame(width: 200)
            }
            ZStack {
                MoleculeView(protein: proteinAtoms, ligand: ligandAtoms)
                    .frame(height: 420)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                if loadingProtein { ProgressView("Loading protein...").padding(8) }
            }
            Text("Drag to rotate, scroll or pinch to zoom. Protein as a Cα trace, residues within 4.5 Å of the pose as sticks, the pose as ball-and-stick.")
                .font(.caption).foregroundColor(.secondary)
        }
    }

    private var posesTable: some View {
        Card(title: "Poses") {
            let rmsd = result.analysis?.rmsd?.values
            Grid(alignment: .leading, horizontalSpacing: 24, verticalSpacing: 6) {
                GridRow {
                    Text("Pose"); Text("Affinity (kcal/mol)"); Text("RMSD l.b."); Text("RMSD u.b.")
                    if rmsd != nil { Text("RMSD to crystal (Å)") }
                }
                .font(.caption).foregroundColor(.secondary)
                Divider()
                ForEach(Array(result.poses.enumerated()), id: \.offset) { i, p in
                    GridRow {
                        Button("Pose \(p.model)") { pose = p.model }
                            .buttonStyle(.link)
                            .fontWeight(pose == p.model ? .bold : .regular)
                        Text(Format.kcal(p.affinity)).monospacedDigit()
                        Text(p.rmsdLb.map { String(format: "%.2f", $0) } ?? "–").monospacedDigit()
                        Text(p.rmsdUb.map { String(format: "%.2f", $0) } ?? "–").monospacedDigit()
                        if let rmsd {
                            Text(i < rmsd.count ? rmsd[i].map { String(format: "%.2f", $0) } ?? "–" : "–").monospacedDigit()
                        }
                    }
                }
            }
            if let le = result.analysis?.ligandEfficiency {
                Text("Ligand efficiency \(String(format: "%.2f", le)) kcal/mol per heavy atom (\(result.analysis?.heavyAtoms ?? 0) heavy atoms).")
                    .font(.caption).foregroundColor(.secondary)
            }
        }
    }

    private func rmsdCard(_ r: Analysis.RMSD) -> some View {
        Card(title: "Redocking validation") {
            if let top = r.values?.first ?? nil {
                Text(String(format: "%.2f Å", top))
                    .font(.system(.largeTitle, design: .rounded).weight(.light))
                    .foregroundColor(top < 2 ? .green : .orange)
                Text("Heavy-atom RMSD of the top pose to the crystal ligand \(r.reference ?? ""). " +
                     (top < 2 ? "Below 2 Å: the protocol reproduces the crystal pose."
                              : "Above 2 Å: the top pose differs from the crystal pose; check the box and protonation."))
                    .foregroundColor(.secondary).fixedSize(horizontal: false, vertical: true)
            } else {
                Text(r.note ?? "RMSD not available.").foregroundColor(.secondary)
            }
        }
    }

    private static let typeLabel = ["hbond": "H-bond", "hydrophobic": "Hydrophobic", "pi_stacking": "π-stacking",
                                    "salt_bridge": "Salt bridge", "metal": "Metal"]

    private var interactionsCard: some View {
        Card {
            HStack {
                Text("Protein–ligand interactions").font(.system(.headline, design: .rounded))
                Spacer()
                Text("Pose \(pose)\(lockedPoses.contains(pose) ? " (Pro)" : "")").foregroundColor(.secondary)
            }
            if interactionsLocked {
                Text(result.analysis?.lockedReason ?? "Interaction analysis for every pose is part of MolDock Pro.")
                Button("See MolDock Pro") { app.section = .pro }.buttonStyle(.borderedProminent)
            } else if let data = interactions {
                if let counts = data.counts, counts.values.contains(where: { $0 > 0 }) {
                    Text(counts.filter { $0.value > 0 }.sorted { $0.key < $1.key }
                            .map { "\(Self.typeLabel[$0.key] ?? $0.key) × \($0.value)" }.joined(separator: "   "))
                }
                if let diagram {
                    Image(nsImage: diagram)
                        .resizable().scaledToFit()
                        .frame(maxWidth: 520, maxHeight: 520)
                        .background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                if let residues = data.residues, !residues.isEmpty {
                    Grid(alignment: .leading, horizontalSpacing: 20, verticalSpacing: 4) {
                        GridRow {
                            Text("Residue"); Text("H-bond"); Text("Hydrophobic"); Text("π"); Text("Salt br."); Text("Min d (Å)")
                        }
                        .font(.caption).foregroundColor(.secondary)
                        ForEach(residues, id: \.residue) { r in
                            GridRow {
                                Text(r.residue).font(.body.monospaced())
                                Text(r.hbond.flatMap { $0 > 0 ? "\($0)" : nil } ?? "")
                                Text(r.hydrophobic.flatMap { $0 > 0 ? "\($0)" : nil } ?? "")
                                Text(r.piStacking.flatMap { $0 > 0 ? "\($0)" : nil } ?? "")
                                Text(r.saltBridge.flatMap { $0 > 0 ? "\($0)" : nil } ?? "")
                                Text(r.minDistance.map { String(format: "%.2f", $0) } ?? "").monospacedDigit()
                            }
                        }
                    }
                } else {
                    Text(data.error ?? "No contacts detected for this pose.").foregroundColor(.secondary)
                }
                Text("Geometric detection: H-bond ≤ 3.5 Å with D–H–A ≥ 120°, hydrophobic C–C ≤ 4.0 Å, π-stacking ≤ 5.5 Å, salt bridge ≤ 5.5 Å.")
                    .font(.caption).foregroundColor(.secondary)
            } else {
                ProgressView().controlSize(.small)
            }
        }
    }

    private var downloads: [(String, String, String)] {
        var list: [(String, String, String)] = [
            ("download/pdb", "Poses PDB", "pdb"),
            ("download/pdbqt", "Poses PDBQT", "pdbqt"),
            ("export/sdf", "Poses SDF", "sdf"),
            ("export/csv", "Poses CSV", "csv"),
            ("export/interactions-csv", "Interactions CSV", "csv"),
        ]
        if result.hasReceptor == true { list.append(("export/complex", "Complex PDB", "pdb")) }
        list.append(("export/zip", "Everything (.zip)", "zip"))
        return list
    }

    private var downloadsCard: some View {
        Card(title: "Downloads") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 10)], alignment: .leading, spacing: 10) {
                ForEach(downloads, id: \.0) { path, label, ext in
                    Button {
                        Task { await download(path, ext: ext) }
                    } label: {
                        Label(downloading == path ? "Downloading..." : label, systemImage: "arrow.down.doc")
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.bordered)
                    .disabled(downloading != nil)
                }
            }
            if let downloadError { Text(downloadError).foregroundColor(.red).font(.callout) }
        }
    }

    private func download(_ path: String, ext: String) async {
        downloading = path
        downloadError = nil
        defer { downloading = nil }
        do {
            let data = try await Backend.raw("/api/results/\(result.jobId)/\(path)")
            let kind = path.split(separator: "/").last.map(String.init) ?? "file"
            FilePanels.save(data, name: "moldock_\(result.jobId.prefix(8))_\(kind).\(ext)")
        } catch {
            downloadError = (error as? Backend.Failure)?.errorDescription ?? "Download failed."
        }
    }

    private func loadProtein() async {
        loadingProtein = true
        defer { loadingProtein = false }
        var text: String?
        if result.hasReceptor == true, let data = try? await Backend.raw("/api/results/\(result.jobId)/export/receptor") {
            text = String(data: data, encoding: .utf8)
        }
        if text == nil {
            let id = result.proteinPdbId
            let url = id.count == 4
                ? URL(string: "https://files.rcsb.org/download/\(id).pdb")!
                : URL(string: "https://alphafold.ebi.ac.uk/files/AF-\(id)-F1-model_v4.pdb")!
            if let (data, resp) = try? await URLSession.shared.data(from: url),
               (resp as? HTTPURLResponse)?.statusCode == 200 {
                text = String(data: data, encoding: .utf8)
            }
        }
        proteinAtoms = text.map(PDBParser.atoms)?.filter { !$0.isHetero } ?? []
    }

    private func loadInteractions() async {
        interactions = nil
        diagram = nil
        interactionsLocked = false
        do {
            interactions = try await Backend.get("/api/results/\(result.jobId)/interactions", query: ["pose": "\(pose)"], timeout: 60)
        } catch {
            if (error as? Backend.Failure)?.paywall == true { interactionsLocked = true; return }
            interactions = Interactions(error: "Interaction analysis is unavailable for this pose.")
            return
        }
        if let data = try? await Backend.raw("/api/results/\(result.jobId)/interactions.svg", query: ["pose": "\(pose)"]) {
            diagram = NSImage(data: data)
        }
    }
}
