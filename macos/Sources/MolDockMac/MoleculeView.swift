import SwiftUI
import SceneKit

/// Minimal PDB / PDBQT reader for the 3D view.
struct Atom {
    var name: String
    var resName: String
    var chain: String
    var resSeq: String
    var element: String
    var position: SIMD3<Float>
    var isHetero: Bool
}

enum PDBParser {
    static func atoms(_ text: String) -> [Atom] {
        var out: [Atom] = []
        for raw in text.split(separator: "\n", omittingEmptySubsequences: true) {
            guard raw.hasPrefix("ATOM") || raw.hasPrefix("HETATM") else { continue }
            let line = Array(raw)
            guard line.count >= 54 else { continue }
            func col(_ a: Int, _ b: Int) -> String {
                guard a < line.count else { return "" }
                return String(line[a..<min(b, line.count)]).trimmingCharacters(in: .whitespaces)
            }
            guard let x = Float(col(30, 38)), let y = Float(col(38, 46)), let z = Float(col(46, 54)) else { continue }
            let name = col(12, 16)
            var element = col(76, 79)
            if element.isEmpty { element = String(name.prefix { $0.isLetter }.prefix(1)) }
            out.append(Atom(name: name, resName: col(17, 20), chain: col(21, 22), resSeq: col(22, 27),
                            element: normalize(element), position: SIMD3(x, y, z), isHetero: raw.hasPrefix("HETATM")))
        }
        return out
    }

    /// PDBQT AutoDock types → elements (A = aromatic C, OA/NA/HD/SA...).
    static func normalize(_ e: String) -> String {
        switch e.uppercased() {
        case "A", "C": return "C"
        case "OA", "O": return "O"
        case "NA", "N", "NS": return "N"
        case "HD", "HS", "H": return "H"
        case "SA", "S": return "S"
        case "CL": return "Cl"
        case "BR": return "Br"
        case "FE": return "Fe"
        case "ZN": return "Zn"
        case "MG": return "Mg"
        default:
            let u = e.uppercased()
            return u.count > 1 ? String(u.prefix(1)) + u.dropFirst().lowercased() : u
        }
    }

    /// MODEL blocks of a multi-model PDB(QT); a file without MODEL is one block.
    static func models(_ text: String) -> [String] {
        var blocks: [String] = []
        var current: [Substring] = []
        var inModel = false
        for line in text.split(separator: "\n", omittingEmptySubsequences: false) {
            if line.hasPrefix("MODEL") { inModel = true; current = [] }
            else if line.hasPrefix("ENDMDL") {
                blocks.append(current.joined(separator: "\n"))
                inModel = false
            } else if inModel { current.append(line) }
        }
        return blocks.isEmpty ? [text] : blocks
    }
}

/// Protein as a Cα tube trace per chain, pocket residues as thin sticks,
/// the docked pose as ball-and-stick (SceneKit).
struct MoleculeView: NSViewRepresentable {
    var protein: [Atom]
    var ligand: [Atom]

    func makeNSView(context: Context) -> SCNView {
        let view = SCNView()
        view.allowsCameraControl = true
        view.autoenablesDefaultLighting = true
        view.backgroundColor = .black
        view.antialiasingMode = .multisampling4X
        view.scene = Self.scene(protein: protein, ligand: ligand)
        context.coordinator.key = Self.key(protein, ligand)
        return view
    }

    func updateNSView(_ view: SCNView, context: Context) {
        let key = Self.key(protein, ligand)
        guard key != context.coordinator.key else { return }
        context.coordinator.key = key
        // Keep the user's camera when only the pose changes.
        let camera = view.pointOfView?.transform
        let sameProtein = context.coordinator.proteinCount == protein.count
        view.scene = Self.scene(protein: protein, ligand: ligand)
        if sameProtein, let camera { view.pointOfView?.transform = camera }
        context.coordinator.proteinCount = protein.count
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        var key = ""
        var proteinCount = 0
    }

    private static func key(_ p: [Atom], _ l: [Atom]) -> String {
        "\(p.count)-\(l.count)-\(l.first?.position.x ?? 0)-\(l.last?.position.z ?? 0)"
    }

    static func color(_ element: String) -> NSColor {
        switch element {
        case "C": return NSColor(white: 0.82, alpha: 1)
        case "O": return NSColor(red: 0.95, green: 0.25, blue: 0.2, alpha: 1)
        case "N": return NSColor(red: 0.3, green: 0.45, blue: 1, alpha: 1)
        case "S": return NSColor(red: 0.95, green: 0.8, blue: 0.2, alpha: 1)
        case "P": return NSColor.orange
        case "F", "Cl": return NSColor(red: 0.3, green: 0.9, blue: 0.3, alpha: 1)
        case "Br": return NSColor.brown
        case "H": return NSColor.white
        default: return NSColor.systemPink
        }
    }

    static func scene(protein: [Atom], ligand: [Atom]) -> SCNScene {
        let scene = SCNScene()
        let root = SCNNode()
        scene.rootNode.addChildNode(root)

        let heavyLigand = ligand.filter { $0.element != "H" }
        let ligandCentre = centroid(heavyLigand) ?? centroid(protein.filter { $0.name == "CA" }) ?? .zero

        // Cα trace, one colour per chain.
        let chainColours: [NSColor] = [.systemTeal, .systemBlue, .systemYellow, .systemGreen, .systemOrange, .systemRed]
        let trace = SCNNode()
        var chainIndex: [String: Int] = [:]
        var previous: Atom?
        // With a pose, show the protein within 24 Å of it so the site isn't buried.
        let near: (Atom) -> Bool = { heavyLigand.isEmpty || simd_distance($0.position, ligandCentre) < 24 }
        for atom in protein where atom.name == "CA" && !atom.isHetero && near(atom) {
            if chainIndex[atom.chain] == nil { chainIndex[atom.chain] = chainIndex.count }
            if let p = previous, p.chain == atom.chain, simd_distance(p.position, atom.position) < 4.3 {
                let colour = chainColours[(chainIndex[atom.chain] ?? 0) % chainColours.count].withAlphaComponent(0.6)
                trace.addChildNode(cylinder(p.position, atom.position, radius: 0.22, colour: colour))
                trace.addChildNode(sphere(atom.position, radius: 0.22, colour: colour))
            }
            previous = atom
        }
        root.addChildNode(trace.flattenedClone())

        // Residues lining the pose (any atom within 4.5 Å), as thin sticks.
        if !heavyLigand.isEmpty {
            var keys = Set<String>()
            for a in protein where !a.isHetero && a.element != "H" {
                if heavyLigand.contains(where: { simd_distance($0.position, a.position) < 4.5 }) {
                    keys.insert("\(a.chain)|\(a.resSeq)")
                }
            }
            let pocketAtoms = protein.filter { keys.contains("\($0.chain)|\($0.resSeq)") && $0.element != "H" && !$0.isHetero }
            let sticks = SCNNode()
            for (a, b) in bonds(pocketAtoms, sameResidueOnly: true) {
                sticks.addChildNode(cylinder(a.position, b.position, radius: 0.1, colour: color(a.element).withAlphaComponent(0.7)))
            }
            root.addChildNode(sticks.flattenedClone())
        }

        // Ligand pose, ball-and-stick.
        let pose = SCNNode()
        for a in heavyLigand {
            pose.addChildNode(sphere(a.position, radius: 0.32, colour: color(a.element)))
        }
        for (a, b) in bonds(heavyLigand, sameResidueOnly: false) {
            let mid = (a.position + b.position) / 2
            pose.addChildNode(cylinder(a.position, mid, radius: 0.13, colour: color(a.element)))
            pose.addChildNode(cylinder(mid, b.position, radius: 0.13, colour: color(b.element)))
        }
        root.addChildNode(pose.flattenedClone())

        root.position = SCNVector3(-ligandCentre.x, -ligandCentre.y, -ligandCentre.z)

        let camera = SCNNode()
        camera.camera = SCNCamera()
        camera.camera?.zFar = 1000
        camera.position = SCNVector3(0, 0, heavyLigand.isEmpty ? 90 : 48)
        scene.rootNode.addChildNode(camera)
        return scene
    }

    private static func centroid(_ atoms: [Atom]) -> SIMD3<Float>? {
        guard !atoms.isEmpty else { return nil }
        return atoms.reduce(SIMD3<Float>.zero) { $0 + $1.position } / Float(atoms.count)
    }

    private static func bonds(_ atoms: [Atom], sameResidueOnly: Bool) -> [(Atom, Atom)] {
        var out: [(Atom, Atom)] = []
        for i in 0..<atoms.count {
            for j in (i + 1)..<max(i + 1, atoms.count) {
                let a = atoms[i], b = atoms[j]
                if sameResidueOnly && (a.chain != b.chain || a.resSeq != b.resSeq) { continue }
                let limit: Float = (a.element == "S" || b.element == "S") ? 1.95 : 1.75
                let d = simd_distance(a.position, b.position)
                if d > 0.4 && d < limit { out.append((a, b)) }
            }
        }
        return out
    }

    private static func material(_ colour: NSColor) -> SCNMaterial {
        let m = SCNMaterial()
        m.diffuse.contents = colour
        m.lightingModel = .blinn
        return m
    }

    private static func sphere(_ p: SIMD3<Float>, radius: CGFloat, colour: NSColor) -> SCNNode {
        let s = SCNSphere(radius: radius)
        s.segmentCount = 16
        s.materials = [material(colour)]
        let n = SCNNode(geometry: s)
        n.position = SCNVector3(p.x, p.y, p.z)
        return n
    }

    private static func cylinder(_ a: SIMD3<Float>, _ b: SIMD3<Float>, radius: CGFloat, colour: NSColor) -> SCNNode {
        let v = b - a
        let length = simd_length(v)
        let c = SCNCylinder(radius: radius, height: CGFloat(length))
        c.radialSegmentCount = 10
        c.materials = [material(colour)]
        let n = SCNNode(geometry: c)
        let mid = (a + b) / 2
        n.position = SCNVector3(mid.x, mid.y, mid.z)
        // Cylinders are along +Y; rotate onto the bond.
        let up = SIMD3<Float>(0, 1, 0)
        let dir = simd_normalize(v)
        let axis = simd_cross(up, dir)
        let angle = acos(max(-1, min(1, simd_dot(up, dir))))
        if simd_length(axis) > 1e-5 {
            n.rotation = SCNVector4(axis.x, axis.y, axis.z, angle)
        } else if dir.y < 0 {
            n.rotation = SCNVector4(1, 0, 0, Float.pi)
        }
        return n
    }
}
