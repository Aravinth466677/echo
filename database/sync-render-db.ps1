param(
    [string]$LocalDbUser = "postgres",
    [string]$LocalDbName = "echo_db",
    [string]$DumpPath = ".\dump.sql",
    [string]$RenderUrl = $env:RENDER_DATABASE_URL
)

$ErrorActionPreference = "Stop"

if (-not $RenderUrl) {
    throw "Provide -RenderUrl or set RENDER_DATABASE_URL in your environment."
}

function Add-SslModeRequire {
    param([string]$ConnectionString)

    if ($ConnectionString -match "(^|[?&])sslmode=") {
        return $ConnectionString
    }

    if ($ConnectionString.Contains("?")) {
        return "$ConnectionString&sslmode=require"
    }

    return "$ConnectionString?sslmode=require"
}

$resolvedDumpPath = Resolve-Path -LiteralPath (Split-Path -Parent $DumpPath) -ErrorAction SilentlyContinue
if ($resolvedDumpPath) {
    $DumpPath = Join-Path $resolvedDumpPath (Split-Path -Leaf $DumpPath)
} else {
    $DumpPath = [System.IO.Path]::GetFullPath($DumpPath)
}

$renderUrlWithSsl = Add-SslModeRequire -ConnectionString $RenderUrl

Write-Host "Exporting local database '$LocalDbName' to $DumpPath ..."
pg_dump -U $LocalDbUser -d $LocalDbName --format=plain --no-owner --no-privileges --encoding=UTF8 -f $DumpPath

Write-Host ""
Write-Host "Preview of dump header:"
Get-Content -LiteralPath $DumpPath -TotalCount 5

$dumpHeader = Get-Content -LiteralPath $DumpPath -TotalCount 3 | Out-String
if ($dumpHeader -notmatch "PostgreSQL database dump") {
    throw "Dump header check failed. '$DumpPath' does not look like a plain SQL PostgreSQL dump."
}

Write-Host ""
Write-Host "Importing dump into Render PostgreSQL with sslmode=require ..."
psql $renderUrlWithSsl -f $DumpPath

Write-Host ""
Write-Host "Done. Verify the backend with:"
Write-Host "  https://echo-1-jbxj.onrender.com/api/health"
