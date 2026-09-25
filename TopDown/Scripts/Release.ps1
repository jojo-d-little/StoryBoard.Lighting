[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidatePattern('^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$')]
    [string]$Version
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,

        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    & $Name @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command '$Name $($Arguments -join ' ')' failed with exit code $LASTEXITCODE."
    }
}

$packagePath = Join-Path $root 'packages\lighting\package.json'
$packageName = '@jojo-d-little/storyboard-lighting'
$semVerPattern = '^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$'

$branch = (git branch --show-current).Trim()
if ($branch -ne 'main') { throw 'Release must start from main.' }
if (git status --porcelain) { throw 'Working tree must be clean before releasing.' }

$package = Get-Content $packagePath -Raw | ConvertFrom-Json
if ($package.name -ne $packageName) {
    throw "Unexpected package name '$($package.name)'. Expected '$packageName'."
}

$currentVersion = [string]$package.version
if ($currentVersion -notmatch $semVerPattern) {
    throw "Current package version '$currentVersion' is not valid SemVer."
}

if (-not $Version) {
    if ($currentVersion -match '^(?<base>\d+\.\d+\.\d+)-(?<label>.*?)(?<number>\d+)$') {
        $Version = "$($matches.base)-$($matches.label)$([int]$matches.number + 1)"
    }
    elseif ($currentVersion -match '^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)$') {
        $Version = "$($matches.major).$($matches.minor).$([int]$matches.patch + 1)"
    }
    else {
        throw "Cannot suggest a patch bump for current version '$currentVersion'."
    }

    $confirmation = Read-Host "Current version is $currentVersion. Use suggested version ${Version}? [Y/n]"
    if ($confirmation -and $confirmation -notmatch '^(?i:y|yes)$') {
        throw 'Release cancelled.'
    }
}

if ($Version -notmatch $semVerPattern) {
    throw "Release version '$Version' is not valid SemVer."
}
if ($Version -eq $currentVersion) {
    throw "Release version '$Version' is already the current package version."
}

$localTag = git tag --list $Version
if ($localTag) { throw "Tag '$Version' already exists locally." }

git ls-remote --exit-code --tags origin "refs/tags/$Version" *> $null
if ($LASTEXITCODE -eq 0) { throw "Tag '$Version' already exists on origin." }
if ($LASTEXITCODE -ne 2) { throw "Could not check whether tag '$Version' exists on origin." }

Write-Host "Updating $packageName from $currentVersion to $Version..."
Invoke-CheckedCommand 'npm' @('pkg', 'set', "version=$Version", '--prefix', 'packages/lighting')

$updatedPackage = Get-Content $packagePath -Raw | ConvertFrom-Json
if ([string]$updatedPackage.version -ne $Version) {
    throw "Package version update failed. Expected '$Version', found '$($updatedPackage.version)'."
}

Write-Host 'Building and validating the package...'
Invoke-CheckedCommand 'npm' @('run', 'build:package')
Invoke-CheckedCommand 'npm' @('run', 'typecheck')
Invoke-CheckedCommand 'npm' @('run', 'typecheck:core')
Invoke-CheckedCommand 'npm' @('test')
Invoke-CheckedCommand 'npm' @('run', 'consumer:packed-smoke')
Invoke-CheckedCommand 'npm' @('run', 'pack:package')

Write-Host "Committing release $Version..."
Invoke-CheckedCommand 'git' @('add', 'packages/lighting/package.json')
Invoke-CheckedCommand 'git' @('commit', '-m', "Release $Version")
Invoke-CheckedCommand 'git' @('tag', '-a', $Version, '-m', "Release $Version")

Write-Host "Pushing main and release tag $Version..."
Invoke-CheckedCommand 'git' @('push', '--atomic', '--follow-tags', 'origin', 'main')

Write-Host "Release $Version pushed. GitHub Actions will validate and publish the package." -ForegroundColor Green
