param(
    [Parameter(Mandatory = $true)][string]$ModelPath,
    [Parameter(Mandatory = $true)][string]$OutputDir
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repo = Split-Path $ModelPath
$file = Split-Path $ModelPath -Leaf

$primaryUrl = "https://huggingface.co/$repo/resolve/main/$file"
$mirrorUrl = "https://huggingface.co/bartowski/$repo/resolve/main/$file"

if (-not (Test-Path -Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$outputFile = Join-Path $OutputDir $file

function Download-Model {
    param([string]$Url)
    try {
        Invoke-WebRequest -Uri $Url -OutFile $outputFile -UseBasicParsing
        Write-Host "Saved model to $outputFile"
        return $true
    } catch {
        Write-Host "Download failed from $Url: $($_.Exception.Message)"
        return $false
    }
}

if (Download-Model $primaryUrl) {
    exit 0
} elseif (Download-Model $mirrorUrl) {
    exit 0
} else {
    Write-Error "Failed to download $file from primary and mirror URLs."
    exit 1
}
