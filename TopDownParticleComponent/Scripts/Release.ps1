[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidatePattern('^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$')]
    [string]$Version
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $root

function Invoke-CheckedCommand {
    param([string]$Name, [string[]]$Arguments)
    & $Name @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command '$Name $($Arguments -join ' ')' failed with exit code $LASTEXITCODE."
    }
}

$packagePath = Join-Path $root 'packages\particles\package.json'
$packageName = '@jojo-d-little/storyboard-particles'
$package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
if ($package.name -ne $packageName) { throw "Unexpected package name '$($package.name)'." }

$branch = (git branch --show-current).Trim()
if ($branch -ne 'main') { throw 'Particle releases must start from main.' }
if (git status --porcelain) { throw 'Working tree must be clean before releasing.' }

$currentVersion = [string]$package.version
if (-not $Version) {
    if ($currentVersion -match '^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)$') {
        $Version = "$($matches.major).$($matches.minor).$([int]$matches.patch + 1)"
    } else {
        throw "Pass a release version for prerelease package '$currentVersion'."
    }
}
if ($Version -eq $currentVersion) { throw "Version '$Version' is already current." }

$tag = "particles-v$Version"
if (git tag --list $tag) { throw "Tag '$tag' already exists locally." }
git ls-remote --exit-code --tags origin "refs/tags/$tag" *> $null
if ($LASTEXITCODE -eq 0) { throw "Tag '$tag' already exists on origin." }
if ($LASTEXITCODE -ne 2) { throw 'Could not check whether the release tag exists on origin.' }

Invoke-CheckedCommand 'npm' @('pkg', 'set', "version=$Version", '--prefix', 'packages/particles')
Invoke-CheckedCommand 'npm' @('run', 'build:package')
Invoke-CheckedCommand 'npm' @('run', 'typecheck')
Invoke-CheckedCommand 'npm' @('test')
Invoke-CheckedCommand 'npm' @('run', 'consumer:smoke')
Invoke-CheckedCommand 'npm' @('run', 'consumer:packed-smoke')
Invoke-CheckedCommand 'npm' @('run', 'pack:package')

Invoke-CheckedCommand 'git' @('add', 'packages/particles/package.json')
Invoke-CheckedCommand 'git' @('commit', '-m', "Release particle package $Version")
Invoke-CheckedCommand 'git' @('tag', '-a', $tag, '-m', "Release particle package $Version")
Invoke-CheckedCommand 'git' @('push', '--atomic', 'origin', 'main', $tag)

Write-Host "Particle release $Version pushed. GitHub Actions will publish $packageName."
