param(
  [string]$Xlsx = (Join-Path $PSScriptRoot '..\PNP 23-24LH.xlsx')
)

# Revisa si el Excel de PNP cambió; si cambió, regenera data/pnp.json y lo publica.
# Se puede ejecutar a mano o programar (Programador de tareas de Windows).

$ErrorActionPreference = 'Stop'
$raiz = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$log = Join-Path $PSScriptRoot 'actualizar-pnp.log'
$huella = Join-Path $PSScriptRoot '.pnp-ultima-huella.txt'

function Registrar([string]$mensaje) {
  $linea = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $mensaje"
  Add-Content -Path $log -Value $linea -Encoding UTF8
  $linea
}

try {
  if (-not (Test-Path $Xlsx)) { Registrar "No se encontró el archivo: $Xlsx"; exit 1 }
  $archivo = Get-Item $Xlsx
  $hash = (Get-FileHash $Xlsx -Algorithm SHA256).Hash
  $anterior = if (Test-Path $huella) { (Get-Content $huella -Raw).Trim() } else { '' }

  if ($hash -eq $anterior) {
    Registrar "Sin cambios (archivo modificado el $($archivo.LastWriteTime.ToString('yyyy-MM-dd HH:mm')))."
    exit 0
  }

  Registrar "Archivo cambió (modificado el $($archivo.LastWriteTime.ToString('yyyy-MM-dd HH:mm')), $([Math]::Round($archivo.Length / 1KB)) KB). Regenerando datos."
  $salida = & (Join-Path $PSScriptRoot 'pnp-a-json.ps1') -Xlsx $Xlsx
  $salida | ForEach-Object { Registrar "  $_" }

  Push-Location $raiz
  git add data/pnp.json
  git diff --cached --quiet
  if ($LASTEXITCODE -eq 0) {
    Registrar 'Los datos generados no cambian respecto a lo publicado; no se hace commit.'
  } else {
    git commit -q -m 'Actualizar datos de PNP desde el Excel'
    git pull --rebase --autostash -q origin main
    git push -q
    Registrar 'Datos de PNP publicados.'
  }
  Pop-Location
  Set-Content -Path $huella -Value $hash -Encoding UTF8
} catch {
  Registrar "ERROR: $($_.Exception.Message)"
  exit 1
}
