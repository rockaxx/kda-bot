$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $projectRoot "manifest.json"
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$version = [string]$manifest.version

if ($version -notmatch '^\d+\.\d+\.\d+(?:\.\d+)?$') {
    throw "Invalid manifest version: $version"
}

$distRoot = Join-Path $projectRoot "dist"
$packageName = "KDA-v$version"
$stageRoot = Join-Path $distRoot $packageName
$zipPath = Join-Path $distRoot "$packageName.zip"
$resolvedProjectRoot = [System.IO.Path]::GetFullPath($projectRoot).TrimEnd('\')
$resolvedDistRoot = [System.IO.Path]::GetFullPath($distRoot).TrimEnd('\')
$resolvedStageRoot = [System.IO.Path]::GetFullPath($stageRoot)
$resolvedZipPath = [System.IO.Path]::GetFullPath($zipPath)

if (-not $resolvedDistRoot.StartsWith("$resolvedProjectRoot\", [System.StringComparison]::OrdinalIgnoreCase) -or
    -not $resolvedStageRoot.StartsWith("$resolvedDistRoot\", [System.StringComparison]::OrdinalIgnoreCase) -or
    -not $resolvedZipPath.StartsWith("$resolvedDistRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe release output path"
}

if (Test-Path -LiteralPath $stageRoot) {
    Remove-Item -Recurse -Force -LiteralPath $stageRoot
}
if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -Force -LiteralPath $zipPath
}

New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null
Copy-Item -LiteralPath $manifestPath -Destination $stageRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "README.md") -Destination $stageRoot
Copy-Item -Recurse -LiteralPath (Join-Path $projectRoot "src") -Destination $stageRoot
Copy-Item -Recurse -LiteralPath (Join-Path $projectRoot "assets") -Destination $stageRoot

$manifestInPackage = Join-Path $stageRoot "manifest.json"
if (-not (Test-Path -LiteralPath $manifestInPackage)) {
    throw "Release package missing manifest.json"
}

Compress-Archive -Path $stageRoot -DestinationPath $zipPath -CompressionLevel Optimal
Write-Output "release package: $zipPath"
