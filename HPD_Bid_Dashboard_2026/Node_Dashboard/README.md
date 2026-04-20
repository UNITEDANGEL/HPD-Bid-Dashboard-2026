# HPD Bid Dashboard 2026

This folder now contains two dashboard paths:

- `server.js`: the local Windows map dashboard with PDF preview and Python document generation
- `app/`: the Next.js mobile-first dashboard prepared for Render hosting and iPhone use

## Recommended hosted version

Use the Next.js app in this folder for Render.

### Local run

```powershell
cd "G:\My Drive\HPD_Bid_Management_Project\HPD_Bid_Dashboard_2026\Node_Dashboard"
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

### Production check

```powershell
cd "G:\My Drive\HPD_Bid_Management_Project\HPD_Bid_Dashboard_2026\Node_Dashboard"
npm run build
npm start
```

## Render deployment

This repo includes a root `render.yaml` Blueprint that builds from the repo root and then runs the Next app inside:

`HPD_Bid_Dashboard_2026/Node_Dashboard`

Render service settings:

- Runtime: `node`
- Build command: `cd HPD_Bid_Dashboard_2026/Node_Dashboard && npm install && npm run build`
- Start command: `cd HPD_Bid_Dashboard_2026/Node_Dashboard && npm start`
- Health check path: `/api/jobs`

## Data source

The hosted dashboard reads from:

`Samples/Merged Data/merged_job_data.csv`

The app falls back to:

`Fetcher_Output/COA_Fetcher_2026.csv`

if the merged file is not present.

## Important hosted limitation

Render can host the mobile dashboard UI and API, but the local Windows-only workflow in `server.js` still depends on:

- local project PDF folders
- the Windows Python path
- runtime temp storage on this machine

That means the Next.js Render version is the hosted dashboard path, while `server.js` remains the richer local desktop operator build.

The Blueprint intentionally does not set a Render `rootDir`, because the hosted app reads CSV data that lives elsewhere in the repo. Render's monorepo rules do not expose files outside a service root directory.
