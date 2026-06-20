param(
  [string]$Repo = "UNITEDANGEL/HPD-Bid-Dashboard-2026",
  [string]$ProjectName = "hpd-bid-dashboard-2026",
  [string]$AccountId = $env:CLOUDFLARE_ACCOUNT_ID,
  [string]$ApiToken = $env:CLOUDFLARE_API_TOKEN
)

$ErrorActionPreference = "Stop"

function Read-SecretPlainText {
  param([string]$Prompt)

  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)

  try {
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Require-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is not installed or is not available on PATH."
  }
}

function Assert-LastCommand {
  param([string]$Action)

  if ($LASTEXITCODE -ne 0) {
    throw "$Action failed with exit code $LASTEXITCODE."
  }
}

function Normalize-SecretValue {
  param([string]$Value)

  $clean = $Value.Trim()
  $clean = $clean -replace '^[Bb]earer\s+', ''
  $clean = $clean.Trim('"').Trim("'").Trim()
  return $clean
}

function Invoke-CloudflareApi {
  param(
    [string]$Method,
    [hashtable]$Headers,
    [string]$Uri,
    [string]$Action
  )

  try {
    Invoke-RestMethod -Method $Method -Headers $Headers -Uri $Uri
  } catch {
    $body = $null
    if ($_.Exception.Response) {
      try {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $body = $reader.ReadToEnd()
      } catch {
        $body = $null
      }
    }

    if ($body) {
      throw "$Action failed. Cloudflare response: $body"
    }

    throw "$Action failed. $($_.Exception.Message)"
  }
}

Require-Command "gh"

Write-Host "Checking GitHub CLI authentication..."
$ghStatus = & gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host $ghStatus
  Write-Host ""
  Write-Host "Run this first, then rerun this script:"
  Write-Host "  gh auth login --web --scopes repo,workflow"
  exit 1
}

if (-not $AccountId) {
  $AccountId = Read-Host -Prompt "Cloudflare Account ID"
}

if (-not $ApiToken) {
  $ApiToken = Read-SecretPlainText -Prompt "Cloudflare API token"
}

$AccountId = Normalize-SecretValue $AccountId
$ApiToken = Normalize-SecretValue $ApiToken

if (-not $AccountId -or -not $ApiToken) {
  throw "Cloudflare Account ID and API token are required."
}

$headers = @{
  Authorization = "Bearer $ApiToken"
  "Content-Type" = "application/json"
}

Write-Host "Verifying Cloudflare token..."
$verify = Invoke-CloudflareApi -Method Get -Headers $headers -Uri "https://api.cloudflare.com/client/v4/user/tokens/verify" -Action "Cloudflare token verification"
if (-not $verify.success) {
  throw "Cloudflare token verification failed."
}

Write-Host "Checking Cloudflare Pages project access..."
$project = Invoke-CloudflareApi -Method Get -Headers $headers -Uri "https://api.cloudflare.com/client/v4/accounts/$AccountId/pages/projects/$ProjectName" -Action "Cloudflare Pages project access check"
if (-not $project.success) {
  throw "Could not access Cloudflare Pages project $ProjectName with this token/account."
}

Write-Host "Setting GitHub Actions repository secrets for $Repo..."
$AccountId | & gh secret set CLOUDFLARE_ACCOUNT_ID --repo $Repo
Assert-LastCommand "Setting CLOUDFLARE_ACCOUNT_ID"
$ApiToken | & gh secret set CLOUDFLARE_API_TOKEN --repo $Repo
Assert-LastCommand "Setting CLOUDFLARE_API_TOKEN"

Write-Host "Triggering Cloudflare Pages deploy workflow..."
& gh workflow run deploy-cloudflare-pages.yml --repo $Repo --ref main
Assert-LastCommand "Triggering deploy workflow"

Write-Host ""
Write-Host "Done. Watch the deploy here:"
Write-Host "https://github.com/$Repo/actions/workflows/deploy-cloudflare-pages.yml"
