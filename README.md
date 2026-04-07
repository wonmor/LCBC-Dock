# DockIt

> AutoDock Vina, reimagined for the web and mobile.

**DockIt** is an online molecular docking platform that brings the power of [AutoDock Vina](https://vina.scripps.edu/) to your browser and your phone. Search proteins and ligands from public databases, configure docking parameters, submit jobs to a processing queue, and visualize docked poses — all without installing anything locally.

### [https://lcbc-client.apps.johnseong.com](https://lcbc-client.apps.johnseong.com) &nbsp;|&nbsp; [Documentation](https://johnseong.github.io/LCBC-Dock/)

Available as a **web app** (Next.js) and a **mobile app** (Expo React Native for iOS & Android).

Developed by **John Seong** in collaboration with [Seoul National University](https://en.snu.ac.kr).

---

## Features

- **Protein Search** — Search the [RCSB Protein Data Bank](https://www.rcsb.org/) (200,000+ structures) via server-side proxy (no CORS issues)
- **Ligand Search** — Search [PubChem](https://pubchem.ncbi.nlm.nih.gov/) (100M+ compounds) by name, with autocomplete, 2D structure images, molecular formula, weight, and SMILES
- **Protein Preparation** — Client-side analysis: counts and removes water molecules and heteroatoms, protonation at pH 7.4
- **Docking Engine** — AutoDock Vina with configurable exhaustiveness and auto-computed grid center
- **Job Queue** — Submit docking jobs and track progress in real time (queued → preparing → docking → completed)
- **Email Notifications** — Get notified when your docking job completes or fails
- **Examples Gallery** — 16 curated famous dockings (Imatinib, Aspirin, Caffeine, Remdesivir, etc.) with search and category filters — tap to start docking instantly
- **3D Viewer** — RCSB 3D viewer for proteins, interactive Mol\* viewer for docked poses
- **Download Results** — Export docked poses in PDB or PDBQT format
- **Mobile App** — Native iOS & Android app built with Expo React Native, same features as the web app

## Examples Gallery

DockIt includes **16 curated famous protein-ligand dockings** with searchable categories. Tap any example to skip straight to docking with pre-filled protein and ligand.

| Ligand | Protein | Category | Description |
|--------|---------|----------|-------------|
| Imatinib | BCR-ABL Kinase (1IEP) | Cancer | First targeted tyrosine kinase inhibitor for CML |
| Nutlin-3a | MDM2 (4HG7) | Cancer | Reactivates p53 tumor suppressor |
| Aspirin | COX-2 (5IKR) | Pain & Inflammation | World's most widely used drug |
| Caffeine | Adenosine A2A (3RFM) | Neuroscience | Blocks adenosine receptors |
| Sildenafil | PDE5 (1UDT) | Cardiovascular | Famous repurposed drug |
| Oseltamivir | Neuraminidase (2HT8) | Antiviral | Tamiflu — frontline influenza antiviral |
| Remdesivir | RdRp (7BV2) | Antiviral | COVID-19 RNA replication terminator |
| Lopinavir | HIV-1 Protease (1MUI) | Antiviral | HIV protease inhibitor |
| Paclitaxel | Tubulin (1JFF) | Cancer | Taxol — stabilizes microtubules |
| Metformin | AMPK (4CFF) | Metabolic | Most prescribed diabetes drug |
| Tamoxifen | Estrogen Receptor α (3ERT) | Cancer | Breast cancer SERM |
| Donepezil | Acetylcholinesterase (2RG6) | Neuroscience | First-line Alzheimer's treatment |
| Erlotinib | EGFR Kinase (3NYA) | Cancer | Lung cancer EGFR inhibitor |
| Atorvastatin | HMG-CoA Reductase (3OGP) | Cardiovascular | Lipitor — best-selling drug in history |
| Methotrexate | DHFR (2ITO) | Cancer | Antimetabolite chemotherapy |
| Penicillin G | PBP (1PWC) | Antibiotic | Started the antibiotic revolution |

Categories: **Cancer**, **Antiviral**, **Neuroscience**, **Cardiovascular**, **Pain & Inflammation**, **Metabolic**, **Antibiotic**

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
                    │  /examples    → curated docking gallery│
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

                    ┌──────────────────────────────────────┐
                    │     Mobile App (Expo React Native)    │
                    │         iOS & Android                 │
                    │                                       │
                    │  Same 4-step docking workflow          │
                    │  Examples gallery with search          │
                    │  WebView for 3D protein visualization │
                    │  Direct API calls (no CORS proxy)     │
                    │                                       │
                    │  Calls backend directly ───────────►  │
                    │  Calls RCSB/PubChem directly          │
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
| — | `/examples` | Browse 16 curated famous dockings with search and category filters |
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
│   ├── examples/page.tsx         # Curated examples gallery
│   ├── dashboard/page.tsx        # Job tracking
│   ├── results/[jobId]/page.tsx  # Results viewer
│   ├── about/page.tsx
│   ├── layout.tsx
│   ├── page.tsx                  # Homepage
│   └── globals.css
├── mobile/                       # Expo React Native app (iOS & Android)
│   ├── app/
│   │   ├── _layout.tsx           # Stack navigator, dark theme
│   │   ├── index.tsx             # Home screen
│   │   ├── examples.tsx          # Examples gallery with search
│   │   ├── dashboard.tsx         # Job tracking
│   │   ├── about.tsx             # About screen
│   │   ├── docking/
│   │   │   ├── protein.tsx       # Step 1: RCSB search + 3D WebView
│   │   │   ├── marinate.tsx      # Step 2: PDB analysis
│   │   │   ├── ligand.tsx        # Step 3: PubChem search
│   │   │   └── cook.tsx          # Step 4: Configure & submit
│   │   └── results/
│   │       └── [jobId].tsx       # Results + downloads
│   ├── components/               # Shared UI components
│   ├── lib/api.ts                # Direct API calls (no CORS proxy)
│   ├── assets/                   # App icons & splash screen
│   └── app.json                  # Expo config (iOS + Android)
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

DockIt uses **two CapRover apps**: a frontend (Next.js) and a backend (FastAPI + Vina).

### Prerequisites

- A CapRover server (e.g. `captain.apps.yourdomain.com`)
- [CapRover CLI](https://caprover.com/docs/cli-commands.html) installed: `npm install -g caprover`
- Two apps created in the CapRover dashboard:
  - **`lcbc-client`** — frontend (container port **3000**)
  - **`lcbc-server`** — backend (container port **8000**)

### Deploy Script

The included `deploy.sh` handles the `captain-definition` swap automatically:

```bash
# Login to CapRover (one-time, saves credentials)
caprover login

# Deploy everything (frontend + backend)
bash deploy.sh all

# Deploy frontend only
bash deploy.sh frontend

# Deploy backend only
bash deploy.sh backend
```

The script will:
1. Swap `captain-definition` to the correct Dockerfile
2. Run `caprover deploy` targeting the correct app
3. Restore `captain-definition` to frontend default afterward

You'll be prompted for your CapRover password if you haven't run `caprover login`.

### CapRover App Setup

| App | Dockerfile | Container Port |
|-----|-----------|----------------|
| `lcbc-client` | `Dockerfile.frontend` | 3000 |
| `lcbc-server` | `Dockerfile.backend` | 8000 |

### Configure the Backend in CapRover Dashboard

Go to `https://captain.apps.johnseong.com` → **lcbc-server** app:

#### Environment Variables (App Configs → Environmental Variables)

| Variable | Value | Required |
|----------|-------|----------|
| `SMTP_USER` | Your Gmail address | For email notifications |
| `SMTP_PASS` | Gmail [App Password](https://myaccount.google.com/apppasswords) | For email notifications |
| `FROM_EMAIL` | `noreply@dockit.app` | Optional |
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
# Should return: {"message":"DockIt API v2.0 is running!","docs":"/docs"}

# Check API docs
open https://lcbc-server.apps.johnseong.com/docs

# Check frontend
open https://lcbc-client.apps.johnseong.com

# Debug PubChem search (if issues)
curl "https://lcbc-client.apps.johnseong.com/api/pubchem?q=aspirin&debug=1"
```

### Quick Redeploy Commands

```bash
bash deploy.sh all        # Redeploy everything
bash deploy.sh frontend   # Redeploy web frontend only
bash deploy.sh backend    # Redeploy backend server only
```

### Bulk Edit Environment Variables

In CapRover dashboard → `lcbc-server` → **App Configs** → **Bulk Edit**, paste:

```
SMTP_USER=yourname@gmail.com
SMTP_PASS=your_16_char_app_password
FROM_EMAIL=yourname@gmail.com
BASE_URL=https://lcbc-client.apps.johnseong.com
```

### Troubleshooting

```bash
# Check if backend is alive
curl https://lcbc-server.apps.johnseong.com/

# If you get 502 Bad Gateway, redeploy the backend
bash deploy.sh backend

# Check CapRover logs in dashboard → lcbc-server → App Logs
```

---

## Mobile App (iOS & Android)

DockIt includes a standalone **Expo React Native** mobile app in the `mobile/` directory.

### Key Differences from Web

- **No CORS proxy needed** — mobile apps call RCSB and PubChem APIs directly
- **WebView** for 3D protein visualization (replaces iframes)
- **expo-web-browser** for file downloads (PDB/PDBQT)
- **Expo Router** for file-based navigation (like Next.js App Router)
- Uses the **same CapRover backend** — no backend changes required

### Running Locally

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with **Expo Go** on your phone, or press `i` for iOS simulator / `a` for Android emulator.

### Building for App Store / Play Store

```bash
# Install EAS CLI
npm install -g eas-cli

# Configure (first time only)
eas build:configure

# Build for both platforms
eas build --platform all

# Submit to stores
eas submit --platform ios
eas submit --platform android
```

Requires an [Apple Developer account](https://developer.apple.com/) ($99/yr) for iOS and a [Google Play Console](https://play.google.com/console/) ($25 one-time) for Android.

### Mobile App Config

The app is configured in `mobile/app.json`:

| Field | Value |
|-------|-------|
| Bundle ID (iOS) | `com.johnseong.dockit` |
| Package (Android) | `com.johnseong.dockit` |
| Backend URL | `https://lcbc-server.apps.johnseong.com` |
| Theme | Dark mode only |
| Orientation | Portrait |

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
docker build -f Dockerfile.backend -t dockit-api .
docker run -p 8000:8000 \
  -e SMTP_USER=your@email.com \
  -e SMTP_PASS=your-app-password \
  -v lcbc-data:/app/data \
  dockit-api

# Frontend
docker build -f Dockerfile.frontend -t dockit-web .
docker run -p 3000:3000 dockit-web
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SMTP_HOST` | SMTP server hostname | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP server port | `587` |
| `SMTP_USER` | SMTP username/email | — |
| `SMTP_PASS` | SMTP password or app password | — |
| `FROM_EMAIL` | Sender email address | `noreply@dockit.app` |
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

- **Web Frontend**: Next.js 13 (App Router), React 18, TypeScript, Tailwind CSS
- **Mobile App**: Expo SDK 52, React Native, Expo Router, WebView
- **Backend**: FastAPI, Python 3.11, AutoDock Vina 1.2.5, Open Babel, SQLite
- **Data Sources**: RCSB Protein Data Bank, PubChem
- **Search Proxies**: Next.js API Routes (server-side, avoids CORS); mobile calls APIs directly
- **Notifications**: SMTP email (Gmail compatible)
- **Deployment**: CapRover (Docker-based PaaS) for web; EAS Build for mobile

## License

[MIT](LICENSE)

---

> Developed and designed by John Seong.
