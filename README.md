# LCBC Dock

> AutoDock Vina, reimagined for the web.

**LCBC Dock** is an online molecular docking platform that brings the power of [AutoDock Vina](https://vina.scripps.edu/) to your browser. Search proteins and ligands from public databases, configure docking parameters, submit jobs to a processing queue, and visualize docked poses — all without installing anything locally.

### [https://lcbc-client.apps.johnseong.com](https://lcbc-client.apps.johnseong.com) &nbsp;|&nbsp; [Documentation](https://johnseong.github.io/LCBC-Dock/)

Developed by **John Seong** in collaboration with [Seoul National University](https://en.snu.ac.kr).

---

## Features

- **Protein Search** — Search the [RCSB Protein Data Bank](https://www.rcsb.org/) (200,000+ structures) via server-side proxy (no CORS issues)
- **Ligand Search** — Search [PubChem](https://pubchem.ncbi.nlm.nih.gov/) (100M+ compounds) by name, with autocomplete, 2D structure images, molecular formula, weight, and SMILES
- **Protein Preparation** — Client-side analysis: counts and removes water molecules and heteroatoms, protonation at pH 7.4
- **Docking Engine** — AutoDock Vina with configurable exhaustiveness and auto-computed grid center
- **Job Queue** — Submit docking jobs and track progress in real time (queued → preparing → docking → completed)
- **Email Notifications** — Get notified when your docking job completes or fails
- **3D Viewer** — RCSB 3D viewer for proteins, interactive Mol\* viewer for docked poses
- **Download Results** — Export docked poses in PDB or PDBQT format

## Architecture

```
                    ┌──────────────────────────────────────┐
                    │     Frontend (Next.js on CapRover)    │
                    │         lcbc-client app               │
                    │                                       │
                    │  /api/rcsb    → RCSB PDB search       │
                    │  /api/pubchem → PubChem search        │
                    │  (server-side proxies, no CORS)       │
                    │                                       │
                    │  /docking/*   → protein/ligand flow   │
                    │  /dashboard   → job tracking           │
                    │  /results/*   → 3D viewer + download  │
                    └──────────────┬───────────────────────┘
                                   │
                                   │ POST /api/dock
                                   │ GET  /api/jobs/{id}
                                   │ GET  /api/results/{id}
                                   ▼
                    ┌──────────────────────────────────────┐
                    │     Backend (FastAPI on CapRover)     │
                    │         lcbc-server app               │
                    │                                       │
                    │  ┌────────────────────────────────┐   │
                    │  │   Docking Worker Thread         │   │
                    │  │   AutoDock Vina + Open Babel    │   │
                    │  └────────────────────────────────┘   │
                    │                                       │
                    │  SQLite (/app/data/lcbc_dock.db)      │
                    │  SMTP email notifications              │
                    └──────────────────────────────────────┘
```

## Docking Workflow

| Step | Page | Description |
|------|------|-------------|
| 1 | `/docking/protein` | Search and select a protein from RCSB PDB |
| 2 | `/docking/marinate` | Prepare protein (remove water, heteroatoms, add charges) |
| 3 | `/docking/ligand` | Search and select a ligand from PubChem |
| 4 | `/docking/cook` | Configure exhaustiveness, add email, and submit |
| — | `/dashboard` | Track job status in real time (polls every 3s) |
| — | `/results/[jobId]` | View 3D docked pose, binding affinities, download files |

## Project Structure

```
LCBC-Dock/
├── app/                          # Next.js frontend (App Router)
│   ├── api/
│   │   ├── pubchem/route.ts      # Server-side PubChem proxy
│   │   └── rcsb/route.ts         # Server-side RCSB PDB proxy
│   ├── docking/
│   │   ├── protein/page.tsx      # Step 1: Protein search
│   │   ├── marinate/page.tsx     # Step 2: Protein preparation
│   │   ├── ligand/page.tsx       # Step 3: Ligand search
│   │   └── cook/page.tsx         # Step 4: Docking config + submit
│   ├── dashboard/page.tsx        # Job tracking
│   ├── results/[jobId]/page.tsx  # Results viewer
│   ├── about/page.tsx
│   ├── layout.tsx
│   ├── page.tsx                  # Homepage
│   └── globals.css
├── api/                          # FastAPI backend
│   ├── index.py                  # Main API (endpoints)
│   ├── docking.py                # Vina docking engine
│   ├── worker.py                 # Background job processor
│   ├── database.py               # SQLite job tracking
│   ├── email_service.py          # SMTP notifications
│   └── models.py                 # Pydantic models
├── docs/                         # GitHub Pages documentation
│   └── index.html
├── Dockerfile.frontend           # Frontend Docker image
├── Dockerfile.backend            # Backend Docker image (includes Vina + Open Babel)
├── captain-definition            # CapRover deploy config (swap for frontend/backend)
├── captain-definition-backend    # CapRover backend deploy config
├── deploy.sh                     # Deploy helper script
├── .env.example                  # Environment variable template
├── package.json
├── requirements.txt
└── README.md
```

---

## Deployment on CapRover

LCBC Dock uses **two CapRover apps**: a frontend (Next.js) and a backend (FastAPI + Vina).

### Prerequisites

- A CapRover server (e.g. `captain.apps.yourdomain.com`)
- [CapRover CLI](https://caprover.com/docs/cli-commands.html) installed: `npm install -g caprover`
- Two apps created in the CapRover dashboard:
  - **`lcbc-client`** — frontend
  - **`lcbc-server`** — backend

### Step 1: Deploy the Frontend

The default `captain-definition` points to `Dockerfile.frontend`.

```bash
# Make sure captain-definition points to frontend
cat captain-definition
# Should show: {"schemaVersion":2,"dockerfilePath":"./Dockerfile.frontend"}

# If not, reset it:
echo '{"schemaVersion":2,"dockerfilePath":"./Dockerfile.frontend"}' > captain-definition

# Deploy
caprover deploy \
  --caproverUrl https://captain.apps.johnseong.com \
  --caproverApp lcbc-client \
  --branch main
```

### Step 2: Deploy the Backend

Swap the `captain-definition` to point to the backend Dockerfile, then deploy:

```bash
# Swap to backend
cp captain-definition-backend captain-definition

# Deploy
caprover deploy \
  --caproverUrl https://captain.apps.johnseong.com \
  --caproverApp lcbc-server \
  --branch main

# Swap back to frontend (important for future frontend deploys)
echo '{"schemaVersion":2,"dockerfilePath":"./Dockerfile.frontend"}' > captain-definition
```

Or as a one-liner:

```bash
cp captain-definition-backend captain-definition && \
caprover deploy --caproverUrl https://captain.apps.johnseong.com --caproverApp lcbc-server --branch main && \
echo '{"schemaVersion":2,"dockerfilePath":"./Dockerfile.frontend"}' > captain-definition
```

### Step 3: Configure the Backend in CapRover Dashboard

Go to `https://captain.apps.johnseong.com` → **lcbc-server** app:

#### Environment Variables (App Configs → Environmental Variables)

| Variable | Value | Required |
|----------|-------|----------|
| `SMTP_USER` | Your Gmail address | For email notifications |
| `SMTP_PASS` | Gmail [App Password](https://myaccount.google.com/apppasswords) | For email notifications |
| `FROM_EMAIL` | `noreply@lcbcdock.com` | Optional |
| `BASE_URL` | `https://lcbc-client.apps.johnseong.com` | For email links |

#### Persistent Storage (App Configs → Persistent Directories)

| Path in App | Label |
|-------------|-------|
| `/app/data` | `lcbc-data` |

This keeps the SQLite job database (`lcbc_dock.db`) alive across redeploys.

#### Enable HTTPS

Go to **HTTP Settings** → **Enable HTTPS** for both apps.

### Step 4: Verify

```bash
# Check backend is running
curl https://lcbc-server.apps.johnseong.com/
# Should return: {"message":"LCBC Dock API v2.0 is running!","docs":"/docs"}

# Check API docs
open https://lcbc-server.apps.johnseong.com/docs

# Check frontend
open https://lcbc-client.apps.johnseong.com

# Debug PubChem search (if issues)
curl "https://lcbc-client.apps.johnseong.com/api/pubchem?q=aspirin&debug=1"
```

### Quick Redeploy Commands

```bash
# Redeploy frontend only
echo '{"schemaVersion":2,"dockerfilePath":"./Dockerfile.frontend"}' > captain-definition
caprover deploy --caproverUrl https://captain.apps.johnseong.com --caproverApp lcbc-client --branch main

# Redeploy backend only
cp captain-definition-backend captain-definition
caprover deploy --caproverUrl https://captain.apps.johnseong.com --caproverApp lcbc-server --branch main
echo '{"schemaVersion":2,"dockerfilePath":"./Dockerfile.frontend"}' > captain-definition
```

---

## Local Development

### Prerequisites

- Node.js 18+
- Python 3.9+
- [AutoDock Vina](https://vina.scripps.edu/) (`vina` binary in PATH) — only needed for docking
- [Open Babel](https://openbabel.org/) (`obabel` binary in PATH) — only needed for docking

### Installation

```bash
git clone https://github.com/wonmor/LCBC-Dock.git
cd LCBC-Dock

npm install                    # Frontend dependencies
pip3 install -r requirements.txt  # Backend dependencies

cp .env.example .env           # Configure environment variables
```

### Running

```bash
# Start both frontend and backend
npm run dev

# Or run separately:
npm run next-dev      # Frontend on http://localhost:3000
npm run fastapi-dev   # Backend on http://localhost:8000
```

The frontend search (protein + ligand) works without the backend — it proxies through Next.js API routes. The backend is only needed for submitting and processing docking jobs.

### Docker (standalone)

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

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SMTP_HOST` | SMTP server hostname | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP server port | `587` |
| `SMTP_USER` | SMTP username/email | — |
| `SMTP_PASS` | SMTP password or app password | — |
| `FROM_EMAIL` | Sender email address | `noreply@lcbcdock.com` |
| `BASE_URL` | Frontend URL (for email links) | `https://lcbc-client.apps.johnseong.com` |
| `LCBC_DB_PATH` | Path to SQLite database file | `lcbc_dock.db` |
| `VINA_PATH` | Path to Vina executable | `vina` |

### Gmail Setup

1. Enable 2-Factor Authentication on your Google account
2. Go to [App Passwords](https://myaccount.google.com/apppasswords)
3. Generate a new app password for "Mail"
4. Use your Gmail as `SMTP_USER` and the app password as `SMTP_PASS`

---

## API Endpoints

All backend endpoints are served from the **lcbc-server** app.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| GET | `/docs` | Interactive API documentation (Swagger) |
| GET | `/api/proteins/search?q=` | Search proteins with metadata |
| GET | `/api/proteins/{pdb_id}` | Get protein details |
| GET | `/api/proteins/{pdb_id}/center` | Compute grid center |
| GET | `/api/ligands/search?q=` | Search PubChem for ligands |
| GET | `/api/ligands/{cid}` | Get ligand details |
| GET | `/api/ligands/{cid}/sdf` | Download ligand 3D SDF |
| POST | `/api/dock` | Submit docking job |
| GET | `/api/jobs/{job_id}` | Get job status + queue position |
| GET | `/api/results/{job_id}` | Get docking results with poses |
| GET | `/api/results/{job_id}/download/pdb` | Download docked PDB |
| GET | `/api/results/{job_id}/download/pdbqt` | Download docked PDBQT |

Frontend proxy routes (same-origin, no CORS):

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pubchem?q=` | PubChem molecule search (server-side proxy) |
| GET | `/api/pubchem?q=&debug=1` | PubChem search with debug logs |
| GET | `/api/rcsb?q=` | RCSB PDB protein search (server-side proxy) |

---

## Tech Stack

- **Frontend**: Next.js 13 (App Router), React 18, TypeScript, Tailwind CSS
- **Backend**: FastAPI, Python 3.11, AutoDock Vina 1.2.5, Open Babel, SQLite
- **Data Sources**: RCSB Protein Data Bank, PubChem
- **Search Proxies**: Next.js API Routes (server-side, avoids CORS)
- **Notifications**: SMTP email (Gmail compatible)
- **Deployment**: CapRover (Docker-based PaaS)

## License

[MIT](LICENSE)

---

> Developed and designed by John Seong.
