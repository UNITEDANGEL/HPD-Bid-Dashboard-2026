param(
    [string]$InstallPath = "D:\dev\HPD-Bid-Dashboard-2026",
    [string]$Branch = "map-preview",
    [switch]$SkipNpmInstall
)

$ErrorActionPreference = "Stop"
$RepoUrl = "https://github.com/UNITEDANGEL/HPD-Bid-Dashboard-2026.git"

function Require-Command {
    param([Parameter(Mandatory = $true)][string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found. Install it, reopen PowerShell, and run this script again."
    }
}

Require-Command git
Require-Command node
Require-Command npm

$parent = Split-Path -Parent $InstallPath
if (-not (Test-Path $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
}

if (-not (Test-Path $InstallPath)) {
    Write-Host "Cloning HPD Dashboard into $InstallPath ..." -ForegroundColor Cyan
    git clone $RepoUrl $InstallPath
}

if (-not (Test-Path (Join-Path $InstallPath ".git"))) {
    throw "$InstallPath exists, but it is not the HPD Dashboard Git repository. Choose another InstallPath or move the existing folder."
}

Set-Location $InstallPath

$origin = (git remote get-url origin).Trim()
if ($origin -notmatch "UNITEDANGEL/HPD-Bid-Dashboard-2026") {
    throw "The repository at $InstallPath uses an unexpected origin: $origin"
}

$dirty = git status --porcelain
if ($dirty) {
    Write-Host "The repository has uncommitted changes. Nothing was reset or deleted." -ForegroundColor Yellow
    git status --short
    throw "Commit, push, or safely stash the current work before switching/syncing computers."
}

Write-Host "Fetching GitHub updates ..." -ForegroundColor Cyan
git fetch origin --prune

$localBranchExists = git show-ref --verify --quiet "refs/heads/$Branch"; $localBranchExists = ($LASTEXITCODE -eq 0)
$remoteBranchExists = git show-ref --verify --quiet "refs/remotes/origin/$Branch"; $remoteBranchExists = ($LASTEXITCODE -eq 0)

if (-not $remoteBranchExists) {
    throw "Remote branch origin/$Branch was not found. Run 'git branch -r' and choose an existing branch."
}

if ($localBranchExists) {
    git checkout $Branch
} else {
    git checkout -b $Branch --track "origin/$Branch"
}

git pull --ff-only origin $Branch

if (-not $SkipNpmInstall) {
    Write-Host "Installing exact Node dependencies ..." -ForegroundColor Cyan
    npm ci
}

$envExample = Join-Path $InstallPath ".env.example"
$envLocal = Join-Path $InstallPath ".env.local"
if ((Test-Path $envExample) -and -not (Test-Path $envLocal)) {
    Copy-Item $envExample $envLocal
    Write-Host "Created .env.local from .env.example. Add this computer's private keys locally." -ForegroundColor Yellow
}

Write-Host "" 
Write-Host "HPD Dashboard workstation is ready." -ForegroundColor Green
Write-Host "Path:   $InstallPath"
Write-Host "Branch: $Branch"
Write-Host ""
Write-Host "Start the app with:"
Write-Host "  cd '$InstallPath'"
Write-Host "  npm run dev -- -p 3138"
Write-Host ""
git status --short --branch
