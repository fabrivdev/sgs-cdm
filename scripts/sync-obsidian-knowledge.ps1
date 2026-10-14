$ErrorActionPreference = 'Stop'
$knowledgeRepo = Split-Path -Parent $PSScriptRoot
$knowledgeConfig = Join-Path $knowledgeRepo 'obsidian-sync.local'
if (-not (Test-Path -LiteralPath $knowledgeConfig)) { exit 0 }
$knowledgeSettings = Get-Content -LiteralPath $knowledgeConfig -Raw | ConvertFrom-Json
$knowledgeNode = if ($knowledgeSettings.nodeExecutable) { $knowledgeSettings.nodeExecutable } else { 'node' }
# Hooks check only. Applying a reviewed reconciliation is an explicit action.
& $knowledgeNode (Join-Path $PSScriptRoot 'sync-obsidian-knowledge.mjs') --check
if ($LASTEXITCODE -ne 0) { Write-Warning 'Atlas pendiente de revisión. No se modificó la bóveda.' }
exit $LASTEXITCODE
