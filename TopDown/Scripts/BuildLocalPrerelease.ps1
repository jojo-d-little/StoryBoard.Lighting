<#
.SYNOPSIS
Builds a local prerelease tarball from the current Lighting working tree.

.DESCRIPTION
Runs build and validation, packs a temporary copy with a prerelease version,
then installs and smoke-tests that exact tarball in a clean consumer. By
default, the preview targets the next patch version (for example, 0.1.4
becomes 0.1.5-preview.<timestamp>.<nonce>). The tarball and checksum manifest
are written to the output directory; the source manifest, Git history, and
remote registry are untouched.

.EXAMPLE
.\Scripts\BuildLocalPrerelease.ps1

.EXAMPLE
.\Scripts\BuildLocalPrerelease.ps1 -Version 0.1.5-preview.1 -OutputDirectory C:\Temp\LightingPreviews
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
$packageRoot = Join-Path $root 'packages\lighting'
$package = Get-Content -LiteralPath (Join-Path $packageRoot 'package.json') -Raw | ConvertFrom-Json
if ($package.name -ne '@jojo-d-little/storyboard-lighting') {
    throw "Unexpected package name '$($package.name)'."
}

if (-not $Version) {
    if ([string]$package.version -notmatch '^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$') {
        throw "Cannot derive a preview version from '$($package.version)'. Pass -Version explicitly."
    }
    $nextPatch = [long]$matches.patch + 1
    $stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss')
    $nonce = Get-Random -Minimum 100000 -Maximum 999999
    $Version = "$($matches.major).$($matches.minor).$nextPatch-preview.$stamp.$nonce"
}

if (-not $OutputDirectory) {
    $OutputDirectory = 'C:\work\LocalNpmDevFeed'
}
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

function Invoke-CheckedNpm {
    param([string[]]$Arguments)
    & npm @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "npm $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
}

Write-Host "Building and validating $($package.name) from the current working tree..."
Push-Location -LiteralPath $root
try {
    Invoke-CheckedNpm -Arguments @('run', 'build:package')
    Invoke-CheckedNpm -Arguments @('run', 'typecheck')
    Invoke-CheckedNpm -Arguments @('run', 'typecheck:core')
    Invoke-CheckedNpm -Arguments @('test')
    Invoke-CheckedNpm -Arguments @('run', 'consumer:smoke')
}
finally {
    Pop-Location
}

$stageRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("StoryboardLightingStage-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stageRoot | Out-Null
try {
    Copy-Item -LiteralPath (Join-Path $packageRoot 'dist') -Destination $stageRoot -Recurse
    Copy-Item -LiteralPath (Join-Path $packageRoot 'README.md') -Destination $stageRoot
    Copy-Item -LiteralPath (Join-Path $packageRoot 'package.json') -Destination $stageRoot

    $stageManifestPath = Join-Path $stageRoot 'package.json'
    $stagePackage = Get-Content -LiteralPath $stageManifestPath -Raw | ConvertFrom-Json
    $stagePackage.version = $Version
    $stagePackage | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $stageManifestPath -Encoding utf8

    $packJson = & npm pack $stageRoot --json --pack-destination $OutputDirectory
    if ($LASTEXITCODE -ne 0) {
        throw "npm pack failed with exit code $LASTEXITCODE."
    }
    $packEntries = @(($packJson -join "`n") | ConvertFrom-Json)
    if ($packEntries.Count -ne 1 -or $packEntries[0].name -ne $package.name -or $packEntries[0].version -ne $Version) {
        throw 'npm pack did not produce the expected preview version.'
    }
    $tarballPath = Join-Path $OutputDirectory $packEntries[0].filename
    if (-not (Test-Path -LiteralPath $tarballPath)) {
        throw "npm pack reported a tarball that does not exist: $tarballPath"
    }
    $packedPaths = @($packEntries[0].files | ForEach-Object { $_.path })
    if ($packedPaths -notcontains 'dist/index.js' -or $packedPaths -notcontains 'dist/index.d.ts') {
        throw 'The preview tarball is missing the built JavaScript or type declarations.'
    }

    $consumerRoot = Join-Path $stageRoot 'consumer'
    New-Item -ItemType Directory -Path $consumerRoot | Out-Null
    Push-Location -LiteralPath $consumerRoot
    try {
        Invoke-CheckedNpm -Arguments @('init', '--yes')
        Invoke-CheckedNpm -Arguments @(
            'install',
            '--no-save',
            '--package-lock=false',
            '--ignore-scripts',
            $tarballPath,
            'pixi.js@8.21.0'
        )

        $consumerScript = @"
import { TopDownLightingPipeline } from '$($package.name)';

const pipeline = new TopDownLightingPipeline({ renderer: {} });
pipeline.submitFrame({ pointLights: [{ x: 10, y: 20 }] });
if (pipeline.getOutputs() !== null) throw new Error('Expected no outputs before room setup');
pipeline.dispose();
console.log('Packed prerelease consumer smoke test passed.');
"@
        $consumerScriptPath = Join-Path $consumerRoot 'consumer-smoke.mjs'
        Set-Content -LiteralPath $consumerScriptPath -Value $consumerScript -Encoding utf8
        & node $consumerScriptPath
        if ($LASTEXITCODE -ne 0) {
            throw "Packed prerelease consumer smoke test failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }

    $hash = (Get-FileHash -LiteralPath $tarballPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $commit = (& git -C $root rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not determine the source Git commit.'
    }
    $workingTreeDirty = [bool](& git -C $root status --porcelain)
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not determine whether the source working tree is dirty.'
    }
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
