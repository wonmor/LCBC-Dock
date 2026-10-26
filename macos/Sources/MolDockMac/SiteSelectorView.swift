import SwiftUI

/// Binding-site + protein-prep controls shared by Dock and Screen
/// (app/components/SiteSelector.tsx).
struct SiteSelectorView: View {
    let protein: String
    @Binding var site: SiteChoice

    @State private var info: StructureInfo?
    @State private var pockets: [Pocket]?
    @State private var loading = false
    @State private var error: String?

    private var ligands: [StructureInfo.Hetero] { info?.hetero.filter { !$0.metal } ?? [] }
    private var metals: [StructureInfo.Hetero] { info?.hetero.filter(\.metal) ?? [] }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Picker("Binding site", selection: modeBinding) {
                ForEach(SiteChoice.Mode.allCases) { m in
                    Text(m.label).tag(m)
                }
            }
            .pickerStyle(.segmented)
            .disabled(protein.isEmpty)

            if loading { ProgressView("Reading structure...").controlSize(.small) }
            if let error { Text(error).foregroundColor(.red).font(.callout) }

            switch site.mode {
            case .ligand:
                if ligands.isEmpty {
                    Text(info == nil ? "Pick a protein first." : "This structure has no co-crystallised ligand. Use a pocket or residues.")
                        .foregroundColor(.secondary).font(.callout)
                } else {
                    Picker("Co-crystal ligand", selection: $site.ligand) {
                        ForEach(ligands, id: \.spec) { h in
                            Text("\(h.label) | \(h.nAtoms) atoms").tag(h.spec)
                        }
                    }
                }
            case .pocket:
                pocketList
            case .residues:
                TextField("Residues, e.g. A:25, B:25, ASP29", text: $site.residues)
                    .textFieldStyle(.roundedBorder)
            case .auto:
                Text("The box covers the whole protein. Slower and less precise; use it when you don't know the site.")
                    .foregroundColor(.secondary).font(.callout)
            }

            if let info, !info.chains.isEmpty {
                Divider()
                Text("Protein preparation").font(.subheadline.weight(.medium))
                HStack(spacing: 12) {
                    Text("Chains").foregroundColor(.secondary)
                    ForEach(info.chains, id: \.chain) { c in
                        Toggle("\(c.chain) (\(c.residues))", isOn: chainBinding(c.chain))
                            .toggleStyle(.checkbox)
                    }
                }
                Text(site.chains.isEmpty ? "All chains are kept." : "Only the ticked chains are kept.")
                    .font(.caption).foregroundColor(.secondary)
                if !metals.isEmpty {
                    HStack(spacing: 12) {
                        Text("Keep metals").foregroundColor(.secondary)
                        ForEach(metals, id: \.label) { m in
                            Toggle(m.label, isOn: heteroBinding(m.resname)).toggleStyle(.checkbox)
                        }
                    }
                }
                HStack {
                    Text("Protonation pH").foregroundColor(.secondary)
                    TextField("pH", value: $site.ph, format: .number.precision(.fractionLength(1)))
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 60)
                    Stepper("", value: $site.ph, in: 0...14, step: 0.1).labelsHidden()
                }
            }
        }
        .task(id: protein) { await inspect() }
    }

    private var modeBinding: Binding<SiteChoice.Mode> {
        Binding(get: { site.mode }, set: { m in
            site.mode = m
            if m == .ligand, !ligands.contains(where: { $0.spec == site.ligand }) {
                site.ligand = ligands.first?.spec ?? ""
            }
            if m == .pocket, pockets == nil { Task { await findPockets() } }
        })
    }

    @ViewBuilder
    private var pocketList: some View {
        if let pockets {
            if pockets.isEmpty {
                Text("No pocket found. Try residues.").foregroundColor(.red).font(.callout)
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(pockets, id: \.rank) { p in
                        Button {
                            site.pocketRank = p.rank
                        } label: {
                            HStack(alignment: .top) {
                                Image(systemName: "checkmark")
                                    .opacity(site.pocketRank == p.rank ? 1 : 0)
                                    .frame(width: 18)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Pocket \(p.rank)  \(Int(p.volumeA3 ?? 0)) Å³  buriedness \(String(format: "%.2f", p.buriedness ?? 0))")
                                    Text((p.residues ?? []).prefix(8).joined(separator: ", "))
                                        .font(.caption).foregroundColor(.secondary)
                                }
                                Spacer()
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        } else {
            ProgressView("Scanning the surface for buried pockets...").controlSize(.small)
        }
    }

    private func chainBinding(_ chain: String) -> Binding<Bool> {
        Binding(get: { site.chains.contains(chain) },
                set: { on in if on { site.chains.insert(chain) } else { site.chains.remove(chain) } })
    }

    private func heteroBinding(_ name: String) -> Binding<Bool> {
        Binding(get: { site.keepHetero.contains(name) },
                set: { on in if on { site.keepHetero.insert(name) } else { site.keepHetero.remove(name) } })
    }

    private func inspect() async {
        info = nil
        pockets = nil
        error = nil
        guard protein.count >= 4 else { return }
        loading = true
        defer { loading = false }
        do {
            let i: StructureInfo = try await Backend.get("/api/structure/\(protein)/inspect", timeout: 45)
            info = i
            site.chains = []
            site.keepHetero = []
            if let first = i.hetero.first(where: { !$0.metal }) {
                if site.mode == .auto || site.mode == .ligand {
                    site.mode = .ligand
                    site.ligand = first.spec
                }
            } else if site.mode == .ligand {
                site.mode = .auto
            }
            if site.mode == .pocket { await findPockets() }
        } catch {
            self.error = "Could not read this structure."
        }
    }

    private func findPockets() async {
        pockets = nil
        let chains = site.chains.sorted().joined(separator: ",")
        let list: PocketList? = try? await Backend.get("/api/structure/\(protein)/pockets",
                                                       query: chains.isEmpty ? [:] : ["chains": chains], timeout: 90)
        pockets = list?.pockets ?? []
        if let first = pockets?.first, !(pockets ?? []).contains(where: { $0.rank == site.pocketRank }) {
            site.pocketRank = first.rank
        }
    }
}
