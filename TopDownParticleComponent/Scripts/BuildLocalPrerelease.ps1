<#
.SYNOPSIS
Builds a local prerelease tarball from the current particle package working tree.

.DESCRIPTION
Runs package validation, stages the built runtime and default images with a
temporary prerelease version, packs and installs that exact tarball in a clean
consumer, and leaves the tarball plus a checksum manifest in the output folder.
The package manifest, Git history, tags, and registry are untouched.

.EXAMPLE
.\Scripts\BuildLocalPrerelease.ps1

.EXAMPLE
.\Scripts\BuildLocalPrerelease.ps1 -Version 0.2.0-preview.1 -OutputDirectory C:\Temp\ParticlePreviews
#>
[CmdletBinding()]
param(
    [ValidatePattern('^[0-9]+\.[0-9]+\.[0-9]+-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*$')]
    [string]$Version,

    [string]$OutputDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$packageRoot = Join-Path $root 'packages\particles'
$packagePath = Join-Path $packageRoot 'package.json'
$package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
if ($package.name -ne '@jojo-d-little/storyboard-particles') {
    throw "Unexpected particle package name '$($package.name)'."
}

if (-not $Version) {
    if ([string]$package.version -notmatch '^(?<major>\d+)\.(?<minor>\d+)\.\d+') {
        throw "Cannot derive a preview version from '$($package.version)'. Pass -Version explicitly."
    }
    $nextMinor = [int]$matches.minor + 1
    $stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss')
    $nonce = Get-Random -Minimum 100000 -Maximum 999999
    $Version = "$($matches.major).$nextMinor.0-preview.$stamp.$nonce"
}

if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path ([System.IO.Path]::GetTempPath()) 'StoryboardParticlePrereleases'
}
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

function Invoke-Checked {
    param(
        [string]$Name,
        [string[]]$Arguments,
        [string]$WorkingDirectory = $root
    )
    Push-Location -LiteralPath $WorkingDirectory
    try {
        & $Name @Arguments
        $exitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }
    if ($exitCode -ne 0) {
        throw "Command '$Name $($Arguments -join ' ')' failed with exit code $exitCode."
    }
}

Write-Host "Validating $($package.name) from the current working tree..."
Invoke-Checked 'npm' @('run', 'build:package')
Invoke-Checked 'npm' @('run', 'typecheck')
Invoke-Checked 'npm' @('test', '--', '--run')
Invoke-Checked 'npm' @('run', 'consumer:smoke')
Invoke-Checked 'npm' @('run', 'consumer:packed-smoke')
Invoke-Checked 'npm' @('run', 'pack:package')

$stageRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("StoryboardParticleStage-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stageRoot | Out-Null
try {
    Copy-Item -LiteralPath (Join-Path $packageRoot 'dist') -Destination $stageRoot -Recurse
    Copy-Item -LiteralPath (Join-Path $packageRoot 'README.md') -Destination $stageRoot
    Copy-Item -LiteralPath $packagePath -Destination $stageRoot
    $stageAssetsRoot = Join-Path $stageRoot 'assets'
    New-Item -ItemType Directory -Path $stageAssetsRoot | Out-Null
    Copy-Item -LiteralPath (Join-Path $packageRoot 'assets\default-images') -Destination $stageAssetsRoot -Recurse

    $stageManifestPath = Join-Path $stageRoot 'package.json'
    $stagePackage = Get-Content -LiteralPath $stageManifestPath -Raw | ConvertFrom-Json
    $stagePackage.version = $Version
    $stagePackage | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $stageManifestPath -Encoding utf8

    $packJson = & npm pack $stageRoot --ignore-scripts --json --pack-destination $OutputDirectory
    if ($LASTEXITCODE -ne 0) {
        throw "npm pack failed with exit code $LASTEXITCODE."
    }
    $packEntries = @(($packJson -join "`n") | ConvertFrom-Json)
    if ($packEntries.Count -ne 1 -or $packEntries[0].version -ne $Version -or $packEntries[0].name -ne $package.name) {
        throw 'npm pack did not produce the expected package name and prerelease version.'
    }
    $tarballPath = Join-Path $OutputDirectory $packEntries[0].filename
    if (-not (Test-Path -LiteralPath $tarballPath)) {
        throw "npm pack reported a tarball that does not exist: $tarballPath"
    }

    $packedPaths = @($packEntries[0].files | ForEach-Object { $_.path })
    foreach ($requiredPath in @(
        'dist/index.js',
        'dist/index.d.ts',
        'dist/advanced.js',
        'dist/advanced.d.ts',
        'README.md',
        'assets/default-images/smoke-puff.png',
        'assets/default-images/rain-ripple.svg'
    )) {
        if ($packedPaths -notcontains $requiredPath) {
            throw "The prerelease tarball is missing required package content '$requiredPath'."
        }
    }

    $consumerRoot = Join-Path $stageRoot 'consumer'
    New-Item -ItemType Directory -Path $consumerRoot | Out-Null
    Invoke-Checked 'npm' @('install', '--no-save', '--package-lock=false', $tarballPath) $consumerRoot
    $consumerScript = Join-Path $consumerRoot 'packed-consumer.mjs'
    Copy-Item -LiteralPath (Join-Path $root 'programmatic-consumer\packed-consumer.mjs') -Destination $consumerScript
    Invoke-Checked 'node' @($consumerScript) $consumerRoot

    $hash = (Get-FileHash -LiteralPath $tarballPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $commit = (& git -C $root rev-parse HEAD).Trim()
    $workingTreeDirty = [bool](& git -C $root status --porcelain)
    $metadata = [ordered]@{
        package = $package.name
        version = $Version
        tarball = [System.IO.Path]::GetFileName($tarballPath)
        sha256 = $hash
        sourceCommit = $commit
        sourceWorkingTreeDirty = $workingTreeDirty
        createdUtc = (Get-Date).ToUniversalTime().ToString('o')
    }
    $metadataPath = "$tarballPath.manifest.json"
    $metadata | ConvertTo-Json | Set-Content -LiteralPath $metadataPath -Encoding utf8

    Write-Host "Local prerelease: $Version"
    Write-Host "Tarball: $tarballPath" -ForegroundColor Green
    Write-Host "SHA-256: $hash"
    Write-Host "Build manifest: $metadataPath"
    Write-Host 'Run this from the consumer npm project:'
    Write-Host ('npm install --no-save --no-package-lock "' + $tarballPath + '"') -ForegroundColor Cyan
    Write-Host 'Nothing was committed, tagged, or published.'
}
finally {
    $resolvedStage = (Resolve-Path -LiteralPath $stageRoot).Path
    $resolvedTemp = (Resolve-Path -LiteralPath ([System.IO.Path]::GetTempPath())).Path.TrimEnd('\')
    if (-not $resolvedStage.StartsWith($resolvedTemp + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove a staging directory outside temp: $resolvedStage"
    }
    Remove-Item -LiteralPath $resolvedStage -Recurse -Force
}
