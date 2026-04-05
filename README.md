# LCBC Dock

> AutoDock Vina, reimagined for the web.

**LCBC Dock** is an online molecular docking platform that brings the power of [AutoDock Vina](https://vina.scripps.edu/) to your browser. Search proteins and ligands from public databases, configure docking parameters, submit jobs to a processing queue, and visualize docked poses — all without installing anything locally.

### [https://lcbcdock.com](https://lcbcdock.com) &nbsp;|&nbsp; [Documentation](https://johnseong.github.io/LCBC-Dock/)

Developed by **John Seong** in collaboration with [Seoul National University](https://en.snu.ac.kr).

---

## Features

- **Protein Search** — Search the [RCSB Protein Data Bank](https://www.rcsb.org/) (200,000+ structures) with detailed metadata (organism, resolution, method)
- **Ligand Search** — Search [PubChem](https://pubchem.ncbi.nlm.nih.gov/) (100M+ compounds) by name, SMILES, or drug name. View 2D structures, molecular formula, weight, and synonyms
- **Protein Preparation** — Automatic removal of water molecules and heteroatoms, protonation at pH 7.4
- **Docking Engine** — AutoDock Vina with configurable grid box, exhaustiveness, and energy range. Auto-computes grid center from protein geometry
- **Job Queue** — Submit docking jobs and track progress in real time. Jobs are processed sequentially with status updates (queued → preparing → docking → completed)
- **Email Notifications** — Get notified when your docking job completes or fails
- **3D Viewer** — Interactive Mol\* viewer for proteins, ligands, and docked poses
- **Download Results** — Export docked poses in PDB or PDBQT format

## Architecture

```
┌─────────────────────┐     ┌──────────────────────────────┐
│   Next.js Frontend  │────▶│      FastAPI Backend          │
│   (React + Mol*)    │◀────│                               │
└─────────────────────┘     │  ┌──────────┐ ┌───────────┐  │
                            │  │ PubChem  │ │ RCSB PDB  │  │
                            │  │  Search  │ │  Search   │  │
                            │  └──────────┘ └───────────┘  │
                            │                               │
                            │  ┌──────────────────────────┐ │
                            │  │   Docking Worker Thread   │ │
                            │  │  ┌─────────┐ ┌────────┐  │ │
                            │  │  │  Vina   │ │ Open   │  │ │
                            │  │  │ Engine  │ │ Babel  │  │ │
                            │  │  └─────────┘ └────────┘  │ │
                            │  └──────────────────────────┘ │
                            │                               │
                            │  ┌──────────┐ ┌───────────┐  │
                            │  │  SQLite  │ │   SMTP    │  │
                            │  │   Jobs   │ │  Email    │  │
                            │  └──────────┘ └───────────┘  │
                            └──────────────────────────────┘
```

## Docking Workflow

| Step | Page | Description |
|------|------|-------------|
| 1 | `/docking/protein` | Search and select a protein from RCSB PDB |
| 2 | `/docking/marinate` | Prepare protein (remove water, heteroatoms, add charges) |
| 3 | `/docking/ligand` | Search and select a ligand from PubChem |
| 4 | `/docking/cook` | Configure grid box, parameters, email, and submit |
| — | `/dashboard` | Track job status in real time |
| — | `/results/[jobId]` | View 3D docked pose, binding affinities, download files |

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.9+
- [AutoDock Vina](https://vina.scripps.edu/) (`vina` binary in PATH)
- [Open Babel](https://openbabel.org/) (`obabel` binary in PATH)

### Installation

```bash
# Clone the repository
git clone https://github.com/johnseong/LCBC-Dock.git
cd LCBC-Dock

# Install frontend dependencies
npm install

# Install backend dependencies
pip3 install -r requirements.txt

# Copy and configure environment variables
cp .env.example .env
# Edit .env with your SMTP credentials
```

### Development

```bash
# Start both frontend and backend
npm run dev

# Or run separately:
npm run next-dev      # Frontend on :3000
npm run fastapi-dev   # Backend on :8000
```

### Docker

```bash
# Backend (includes Vina + Open Babel)
docker build -f Dockerfile.backend -t lcbc-dock-api .
docker run -p 8000:8000 \
  -e SMTP_USER=your@email.com \
  -e SMTP_PASS=your-app-password \
  -v lcbc-data:/app/data \
  lcbc-dock-api

# Frontend
docker build -f Dockerfile.frontend -t lcbc-dock-web .
docker run -p 3000:3000 lcbc-dock-web
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SMTP_HOST` | SMTP server hostname | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP server port | `587` |
| `SMTP_USER` | SMTP username/email | — |
| `SMTP_PASS` | SMTP password or app password | — |
| `FROM_EMAIL` | Sender email address | `noreply@lcbcdock.com` |
| `BASE_URL` | Public URL for email links | `https://lcbcdock.com` |
| `LCBC_DB_PATH` | Path to SQLite database file | `lcbc_dock.db` |
| `VINA_PATH` | Path to Vina executable | `vina` |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/search/{term}` | Search RCSB PDB (legacy) |
| GET | `/api/proteins/search?q=` | Search proteins with metadata |
| GET | `/api/proteins/{pdb_id}` | Get protein details |
| GET | `/api/proteins/{pdb_id}/center` | Compute grid center |
| GET | `/api/ligands/search?q=` | Search PubChem for ligands |
| GET | `/api/ligands/{cid}` | Get ligand details |
| GET | `/api/ligands/{cid}/sdf` | Download ligand 3D SDF |
| POST | `/api/dock` | Submit docking job |
| GET | `/api/jobs/{job_id}` | Get job status |
| GET | `/api/results/{job_id}` | Get docking results |
| GET | `/api/results/{job_id}/download/pdb` | Download docked PDB |
| GET | `/api/results/{job_id}/download/pdbqt` | Download docked PDBQT |

## Tech Stack

- **Frontend**: Next.js 13, React, TypeScript, Tailwind CSS, Mol\* (3D viewer), Material UI
- **Backend**: FastAPI, Python, AutoDock Vina, Open Babel, SQLite
- **Data Sources**: RCSB PDB, PubChem
- **Notifications**: SMTP email

## License

[MIT](LICENSE)

---

> Developed and designed by John Seong.
