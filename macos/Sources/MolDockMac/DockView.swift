import SwiftUI

/// Single-ligand docking: protein, ligand, binding site, parameters, submit.
/// Mirrors the web flow (docking/protein → ligand → cook). Plan limits come
/// from /api/account and are enforced by the server (strict submit).
struct DockView: View {
    @EnvironmentObject private var app: AppModel
    @EnvironmentObject private var store: AccountStore

    enum LigandSource: String, CaseIterable, Identifiable {
        case pubchem = "PubChem"
        case smiles = "SMILES"
        case sdf = "SDF file"
        var id: String { rawValue }
    }

    // Protein
    @State private var proteinQuery = ""
    @State private var proteinHits: [ProteinHit]?
    @State private var searchingProteins = false
    @State private var protein = ""
    @State private var proteinTitle: String?

    // Ligand
    @State private var ligandSource = LigandSource.pubchem
    @State private var ligandQuery = ""
    @State private var ligandHits: [LigandHit]?
    @State private var searchingLigands = false
    @State private var ligand: DockingService.Ligand?
    @State private var smiles = ""
    @State private var smilesName = ""
    @State private var sdfText: String?
    @State private var sdfName = ""

    // Site + parameters
    @State private var site = SiteChoice()
    @State private var exhaustiveness = 8.0
    @State private var numModes = 9
    @State private var seed = ""
    @State private var isPrivate = false
    @State private var redock = true

    @State private var submitting = false
    @State private var error: ShownError?
    @State private var notice: String?

    private var limits: PlanLimits? { store.account?.limits }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                PageTitle(title: "Dock", subtitle: "AutoDock Vina on the MolDock servers. Pick a protein and a ligand, choose the site, submit.")
                proteinCard
                ligandCard
                Card(title: "3. Binding site") {
                    if protein.isEmpty {
                        Text("Pick a protein first.").foregroundColor(.secondary)
                    } else {
                        SiteSelectorView(protein: protein, site: $site)
                        if site.mode == .ligand {
                            Toggle("Redocking check: report RMSD of each pose to the crystal ligand", isOn: $redock)
                                .toggleStyle(.checkbox)
                        }
                    }
                }
                parametersCard
                submitBar
            }
            .frame(maxWidth: 760, alignment: .leading)
            .padding(40)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .onAppear(perform: applyDraft)
        .onChange(of: app.dockDraft) { _ in applyDraft() }
    }

    // MARK: Protein

    private var proteinCard: some View {
        Card(title: "1. Protein") {
            HStack {
                TextField("PDB ID (1HSG), UniProt accession (P00533) or keywords (HIV protease)", text: $proteinQuery)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit { Task { await searchProteins() } }
                Button(searchingProteins ? "Searching..." : "Search") { Task { await searchProteins() } }
                    .disabled(proteinQuery.trimmingCharacters(in: .whitespaces).isEmpty || searchingProteins)
                Button("Open PDB File...", action: openPDB)
            }
            if !protein.isEmpty {
                HStack(alignment: .firstTextBaseline) {
                    Image(systemName: "checkmark")
                    Text(protein).font(.body.monospaced().weight(.semibold))
                    if let proteinTitle { Text(proteinTitle).foregroundColor(.secondary).lineLimit(1) }
                    Spacer()
                    Button("Change") { protein = ""; proteinTitle = nil }.buttonStyle(.link)
                }
            }
            if let hits = proteinHits, protein.isEmpty {
                if hits.isEmpty {
                    Text("No structures found.").foregroundColor(.secondary)
                } else {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(hits) { h in
                            Button { pickProtein(h.pdbId, title: h.title) } label: {
                                HStack(alignment: .top, spacing: 12) {
                                    Text(h.pdbId).font(.body.monospaced().weight(.medium)).frame(width: 52, alignment: .leading)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(h.title ?? h.pdbId).lineLimit(2)
                                        Text([h.organism, h.method, h.resolution.map { String(format: "%.2f Å", $0) }]
                                                .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " | "))
                                            .font(.caption).foregroundColor(.secondary)
                                    }
                                    Spacer()
                                }
                                .padding(.vertical, 6)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            Divider()
                        }
                    }
                }
            }
        }
    }

    private func searchProteins() async {
        let q = proteinQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return }
        // A bare ID is used as typed (PDB ID or UniProt accession → AlphaFold).
        if q.range(of: #"^[0-9][A-Za-z0-9]{3}$"#, options: .regularExpression) != nil ||
            q.range(of: #"^[OPQ][0-9][A-Z0-9]{3}[0-9]$|^[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2}$"#, options: .regularExpression) != nil {
            let id = q.uppercased()
            let detail: ProteinHit? = try? await Backend.get("/api/proteins/\(id)")
            pickProtein(id, title: detail?.title ?? (id.count == 4 ? nil : "AlphaFold model"))
            return
        }
        searchingProteins = true
        defer { searchingProteins = false }
        proteinHits = (try? await Backend.get("/api/proteins/search", query: ["q": q], timeout: 60)) ?? []
    }

    private func pickProtein(_ id: String, title: String?) {
        protein = id.uppercased()
        proteinTitle = title
        proteinHits = nil
        site = SiteChoice()
    }

    /// The server docks against PDB / AlphaFold entries, so a local file is
    /// used for its PDB ID (HEADER record).
    private func openPDB() {
        guard let url = FilePanels.open(types: ["pdb", "ent", "cif"]),
              let text = try? String(contentsOf: url, encoding: .utf8) else { return }
        var id: String?
        if let header = text.split(separator: "\n").first(where: { $0.hasPrefix("HEADER") }), header.count >= 66 {
            let chars = Array(header)
            id = String(chars[62..<66]).trimmingCharacters(in: .whitespaces)
        } else if let line = text.split(separator: "\n").first(where: { $0.hasPrefix("data_") }) {
            id = String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)
        }
        if let id, id.count == 4 {
            pickProtein(id, title: url.lastPathComponent)
            error = nil
        } else {
            error = ShownError(message: "\(url.lastPathComponent) has no PDB ID in its header. MolDock docks against PDB entries and AlphaFold models; search for the entry instead.")
        }
    }

    // MARK: Ligand

    private var ligandCard: some View {
        Card(title: "2. Ligand") {
            Picker("Source", selection: $ligandSource) {
                ForEach(LigandSource.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .onChange(of: ligandSource) { _ in ligand = nil }

            switch ligandSource {
            case .pubchem:
                if let lig = ligand, lig.cid > 0 {
                    HStack(alignment: .firstTextBaseline) {
                        Image(systemName: "checkmark")
                        Text(lig.name).fontWeight(.semibold)
                        Text("CID \(String(lig.cid))").font(.caption.monospaced()).foregroundColor(.secondary)
                        Spacer()
                        Button("Change") { ligand = nil }.buttonStyle(.link)
                    }
                } else {
                    HStack {
                        TextField("Name or PubChem CID (aspirin, 2244)", text: $ligandQuery)
                            .textFieldStyle(.roundedBorder)
                            .onSubmit { Task { await searchLigands() } }
                        Button(searchingLigands ? "Searching..." : "Search") { Task { await searchLigands() } }
                            .disabled(ligandQuery.trimmingCharacters(in: .whitespaces).isEmpty || searchingLigands)
                    }
                    if let hits = ligandHits {
                        if hits.isEmpty {
                            Text("No molecules found.").foregroundColor(.secondary)
                        }
                        ForEach(hits) { h in
                            Button {
                                ligand = DockingService.Ligand(cid: h.cid ?? 0, name: h.name)
                                ligandHits = nil
                            } label: {
                                HStack {
                                    Text(h.name).fontWeight(.medium)
                                    Text("CID \(String(h.cid ?? 0))").font(.caption.monospaced()).foregroundColor(.secondary)
                                    Text(h.molecularFormula ?? "").foregroundColor(.secondary)
                                    if let w = h.molecularWeight?.value, w > 0 {
                                        Text(String(format: "%.1f g/mol", w)).foregroundColor(.secondary)
                                    }
                                    Spacer()
                                }
                                .padding(.vertical, 4)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            case .smiles:
                TextField("SMILES, e.g. CC(=O)Oc1ccccc1C(=O)O", text: $smiles)
                    .textFieldStyle(.roundedBorder)
                    .font(.body.monospaced())
                TextField("Name (optional)", text: $smilesName)
                    .textFieldStyle(.roundedBorder)
            case .sdf:
                HStack {
                    Button("Open SDF / MOL File...", action: openSDF)
                    if sdfText != nil {
                        Image(systemName: "checkmark")
                        Text(sdfName).fontWeight(.medium)
                    }
                }
                Text("The first record is docked. For a library, use Screen.")
                    .font(.caption).foregroundColor(.secondary)
            }
        }
    }

    private func searchLigands() async {
        let q = ligandQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return }
        searchingLigands = true
        defer { searchingLigands = false }
        if let cid = Int(q) {
            struct Detail: Decodable { var cid: Int; var name: String }
            if let d: Detail = try? await Backend.get("/api/ligands/\(cid)", timeout: 30) {
                ligand = DockingService.Ligand(cid: d.cid, name: d.name)
                ligandHits = nil
            } else {
                ligandHits = []
            }
            return
        }
        let hits: [LigandHit] = (try? await Backend.get("/api/ligands/search", query: ["q": q], timeout: 60)) ?? []
        ligandHits = hits.filter { ($0.cid ?? 0) > 0 }
    }

    private func openSDF() {
        guard let url = FilePanels.open(types: ["sdf", "mol", "sd"]),
              let text = try? String(contentsOf: url, encoding: .utf8) else { return }
        let first = text.components(separatedBy: "$$$$").first ?? text
        sdfText = first.trimmingCharacters(in: .newlines) + "\n$$$$\n"
        let title = first.split(separator: "\n", omittingEmptySubsequences: false).first.map(String.init)?
            .trimmingCharacters(in: .whitespaces) ?? ""
        sdfName = title.isEmpty ? url.deletingPathExtension().lastPathComponent : title
    }

    private var chosenLigand: DockingService.Ligand? {
        switch ligandSource {
        case .pubchem:
            return ligand
        case .smiles:
            let s = smiles.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !s.isEmpty else { return nil }
            let name = smilesName.trimmingCharacters(in: .whitespaces)
            return DockingService.Ligand(cid: 0, name: name.isEmpty ? "ligand" : name, smiles: s)
        case .sdf:
            guard let sdfText else { return nil }
            return DockingService.Ligand(cid: 0, name: sdfName, sdf: sdfText)
        }
    }

    // MARK: Parameters

    private var parametersCard: some View {
        Card(title: "4. Parameters") {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("Exhaustiveness")
                    Spacer()
                    Text("\(Int(exhaustiveness))").monospacedDigit()
                }
                Slider(value: $exhaustiveness, in: 1...32, step: 1)
                limitNote(Int(exhaustiveness) > (limits?.maxExhaustiveness ?? 32),
                          "Above \(limits?.maxExhaustiveness ?? 8) needs MolDock Pro.",
                          else: "Lower is faster, higher gives more reproducible searches. 8 is the Vina default.")
            }
            HStack(spacing: 24) {
                Stepper("Poses: \(numModes)", value: $numModes, in: 1...20)
                HStack {
                    Text("Random seed")
                    TextField("blank = random", text: $seed)
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 120)
                }
            }
            limitNote(numModes > (limits?.maxNumModes ?? 20), "More than \(limits?.maxNumModes ?? 9) poses needs MolDock Pro.", else: nil)
            Toggle("Private job (only you can open the results)", isOn: $isPrivate)
                .toggleStyle(.checkbox)
            limitNote(isPrivate && limits?.privateJobs != true, "Private jobs need MolDock Pro.", else: nil)
        }
    }

    @ViewBuilder
    private func limitNote(_ over: Bool, _ text: String, else other: String?) -> some View {
        if over {
            HStack {
                Text(text).foregroundColor(.orange)
                Button("See Pro") { app.section = .pro }.buttonStyle(.link)
            }
            .font(.caption)
        } else if let other {
            Text(other).font(.caption).foregroundColor(.secondary)
        }
    }

    // MARK: Submit

    private var submitBar: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let usage = store.account?.usage {
                Text("\(usage.usedToday) of \(usage.jobsPerDay) dockings used today on \(store.account?.tierLabel ?? "your plan").")
                    .font(.caption).foregroundColor(.secondary)
            }
            if let error { ErrorLine(error: error) }
            if let notice { Text(notice).foregroundColor(.secondary).font(.callout) }
            Button {
                Task { await submit() }
            } label: {
                Text(submitting ? "Submitting..." : "Start docking").frame(minWidth: 160)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(submitting || protein.isEmpty || chosenLigand == nil || !site.isComplete)
        }
    }

    private func submit() async {
        guard let lig = chosenLigand else { return }
        submitting = true
        error = nil
        defer { submitting = false }
        do {
            let reply = try await DockingService.submit(
                protein: protein, ligand: lig, site: site, exhaustiveness: Int(exhaustiveness),
                numModes: numModes, seed: Int(seed.trimmingCharacters(in: .whitespaces)),
                isPrivate: isPrivate, redock: redock)
            await store.refresh()
            app.openJob(reply.jobId)
        } catch {
            self.error = ShownError(error, fallback: "Couldn't submit the docking. Try again.")
        }
    }

    private func applyDraft() {
        guard let d = app.dockDraft else { return }
        app.dockDraft = nil
        pickProtein(d.protein, title: nil)
        proteinQuery = d.protein
        ligandSource = .pubchem
        ligandQuery = d.ligandName
        DispatchQueue.main.async {
            ligand = DockingService.Ligand(cid: d.ligandCid, name: d.ligandName)
        }
        Task {
            let detail: ProteinHit? = try? await Backend.get("/api/proteins/\(d.protein)")
            if protein == d.protein.uppercased() { proteinTitle = detail?.title }
        }
    }
}
