param(
  [string]$Source = "shared/data/cp-data.json",
  [string]$Output = "shared/data/cp-data.meta.json"
)

$resolvedSource = (Resolve-Path -LiteralPath $Source).Path
$revision = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedSource).Hash.ToLowerInvariant()
$metadata = [ordered]@{
  algorithm = "SHA-256"
  revision = $revision
  source = [System.IO.Path]::GetFileName($resolvedSource)
}
[System.IO.File]::WriteAllText(
  $Output,
  ($metadata | ConvertTo-Json),
  [System.Text.UTF8Encoding]::new($false)
)
Write-Output $revision
