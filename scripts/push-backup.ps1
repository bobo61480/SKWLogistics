param(
  [Parameter(Mandatory = $true)]
  [string]$RepositoryUrl,

  [string]$RemoteName = "backup"
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

Push-Location $repoRoot
try {
  $changes = git status --porcelain
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to inspect the backup repository."
  }
  if ($changes) {
    throw "Commit or discard local changes before pushing the backup."
  }

  $existing = git remote
  if ($existing -contains $RemoteName) {
    git remote set-url $RemoteName $RepositoryUrl
  } else {
    git remote add $RemoteName $RepositoryUrl
  }
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to configure the backup remote."
  }

  git push --set-upstream $RemoteName main
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to push the main branch."
  }

  git push $RemoteName --tags
  if ($LASTEXITCODE -ne 0) {
    throw "The main branch was pushed, but the version tags failed to push."
  }
} finally {
  Pop-Location
}

