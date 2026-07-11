# HPD Dashboard: Continue From Any Computer

GitHub is the shared source of truth for the project. Every computer should use the same repository and the same active branch.

- Repository: `UNITEDANGEL/HPD-Bid-Dashboard-2026`
- Current preview branch: `map-preview`
- Recommended local path: `D:\dev\HPD-Bid-Dashboard-2026`

## First-time setup on another Windows computer

Install Git and Node.js first, then open PowerShell:

```powershell
New-Item -ItemType Directory -Path D:\dev -Force | Out-Null
git clone https://github.com/UNITEDANGEL/HPD-Bid-Dashboard-2026.git D:\dev\HPD-Bid-Dashboard-2026
cd D:\dev\HPD-Bid-Dashboard-2026
git checkout map-preview
npm ci
Copy-Item .env.example .env.local -ErrorAction SilentlyContinue
npm run dev -- -p 3138
```

Open:

```text
http://localhost:3138/map
```

Add private values to `.env.local` on that computer. Never commit real keys.

## Safe automatic setup/sync

After the repository exists on a computer:

```powershell
cd D:\dev\HPD-Bid-Dashboard-2026
powershell -ExecutionPolicy Bypass -File .\scripts\setup-workstation.ps1
```

The script:

1. Verifies Git, Node, and npm.
2. Verifies the correct repository.
3. Refuses to overwrite uncommitted work.
4. Fetches GitHub updates.
5. Checks out `map-preview`.
6. Pulls with `--ff-only`.
7. Runs `npm ci`.
8. Creates `.env.local` from `.env.example` when needed.

## Before leaving one computer

Always save the work to GitHub before moving to another computer:

```powershell
cd D:\dev\HPD-Bid-Dashboard-2026
git status
```

Stage only the files you intentionally changed. Do not use `git add .` when generated data or runtime files are present.

Example:

```powershell
git add app/map/MapAiDashboard.tsx app/map/map-ai-dashboard-v2.css app/map/page.tsx
git commit -m "Describe the completed map upgrade"
git push origin map-preview
```

Confirm:

```powershell
git status -sb
```

The working tree should be clean and the branch should match `origin/map-preview`.

## When starting on another computer

```powershell
cd D:\dev\HPD-Bid-Dashboard-2026
git status -sb
git fetch origin
git checkout map-preview
git pull --ff-only origin map-preview
npm ci
npm run dev -- -p 3138
```

## What GitHub copies

GitHub copies committed source code, tracked data, scripts, documentation, and project history.

GitHub intentionally does not copy local-only items ignored by `.gitignore`, including:

- `.env.local` and other secrets
- `credentials.json`, `token.json`, and API-key files
- `node_modules`, `.next`, and Cloudflare build output
- downloaded COA/ITB PDF folders
- runtime logs and temporary backup files

Those items must either be recreated on each computer or transferred separately through secure storage. Do not place private credentials in Git.

## Rule for ChatGPT and Codex handoff

Both tools should:

1. Work in `D:\dev\HPD-Bid-Dashboard-2026`.
2. Confirm the active branch before editing.
3. Pull before starting.
4. Commit clear, focused changes.
5. Push before handing off.
6. Never reset, clean, or stage the whole drive/profile repository.
