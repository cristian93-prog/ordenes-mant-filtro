param(
  [string]$Xlsx = (Join-Path $PSScriptRoot '..\PNP 23-24LH.xlsx'),
  [string]$Hoja = 'Sheet1',
  [string]$Salida = (Join-Path $PSScriptRoot '..\data\pnp.json')
)

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path $Xlsx))

function ReadEntry($name) {
  $e = $zip.Entries | Where-Object { $_.FullName -eq $name }
  if (-not $e) { return $null }
  $sr = New-Object IO.StreamReader($e.Open(), [Text.Encoding]::UTF8)
  $t = $sr.ReadToEnd(); $sr.Close(); $t
}

function Quitar-Acentos([string]$s) {
  $d = $s.Normalize([Text.NormalizationForm]::FormD)
  $sb = New-Object System.Text.StringBuilder
  foreach ($ch in $d.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch) -ne 'NonSpacingMark') { [void]$sb.Append($ch) }
  }
  $sb.ToString()
}

function Limpiar([string]$s) { (($s -replace '\s+', ' ').Trim()) }

function Recortar([string]$s, [int]$max) { if ($s.Length -gt $max) { $s.Substring(0, $max) + '…' } else { $s } }

function Mecanismo([string]$s) {
  $t = (Quitar-Acentos $s).ToLower()
  if ($t -match 'mecan') { return 'Mecánica' }
  if ($t -match 'electr') { return 'Eléctrica' }
  if ($t -match 'instrument') { return 'Instrumentación' }
  if ($t -match 'material') { return 'Material' }
  return ''
}

[xml]$wb = ReadEntry 'xl/workbook.xml'
$ns = New-Object Xml.XmlNamespaceManager($wb.NameTable)
$ns.AddNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
$sheet = $wb.SelectNodes('//m:sheets/m:sheet', $ns) | Where-Object { $_.name -eq $Hoja }
$rid = $sheet.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
[xml]$rels = ReadEntry 'xl/_rels/workbook.xml.rels'
$target = ($rels.Relationships.Relationship | Where-Object { $_.Id -eq $rid }).Target
$target = $target.TrimStart('/'); if ($target -notlike 'xl/*') { $target = 'xl/' + $target }

$shared = New-Object System.Collections.ArrayList
[xml]$ss = ReadEntry 'xl/sharedStrings.xml'
$ssns = New-Object Xml.XmlNamespaceManager($ss.NameTable)
$ssns.AddNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
foreach ($si in $ss.SelectNodes('//m:si', $ssns)) {
  [void]$shared.Add((($si.SelectNodes('.//m:t', $ssns) | ForEach-Object { $_.InnerText }) -join ''))
}

function ColIdx($ref) {
  $l = ($ref -replace '\d', ''); $n = 0
  foreach ($ch in $l.ToCharArray()) { $n = $n * 26 + ([int][char]$ch - 64) }
  return $n
}

[xml]$sx = ReadEntry $target
$sns = New-Object Xml.XmlNamespaceManager($sx.NameTable)
$sns.AddNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
$rows = $sx.SelectNodes('//m:sheetData/m:row', $sns)
$zip.Dispose()

$table = New-Object System.Collections.ArrayList
foreach ($r in $rows) {
  $row = @{}
  foreach ($c in $r.SelectNodes('m:c', $sns)) {
    $idx = ColIdx $c.GetAttribute('r')
    $t = $c.GetAttribute('t')
    $v = $c.SelectSingleNode('m:v', $sns)
    $val = ''
    if ($t -eq 's' -and $v) { $val = $shared[[int]$v.InnerText] }
    elseif ($t -eq 'inlineStr') { $val = (($c.SelectNodes('.//m:t', $sns) | ForEach-Object { $_.InnerText }) -join '') }
    elseif ($v) { $val = $v.InnerText }
    $row[$idx] = $val
  }
  [void]$table.Add(@{ n = [int]$r.GetAttribute('r'); c = $row })
}

$hdr = $table | Where-Object { @($_.c.Values | Where-Object { $_ -ne '' }).Count -ge 10 } | Select-Object -First 1
$col = @{}
foreach ($k in $hdr.c.Keys) { $col[(Limpiar $hdr.c[$k])] = $k }
foreach ($req in 'ID', 'Hora de inicio', 'Línea', 'Máquina', 'Componente', 'Tipo de PNP', 'Tiempo de parada en minutos', 'Hora', 'Mecanismo Falla', 'Turno') {
  if (-not $col.ContainsKey($req)) { throw "No se encontró la columna '$req' en la hoja $Hoja" }
}

$eventos = New-Object System.Collections.ArrayList
foreach ($t in $table) {
  if ($t.n -le $hdr.n) { continue }
  $ini = $t.c[$col['Hora de inicio']]
  if (-not $ini) { continue }
  $fecha = [DateTime]::FromOADate([double]$ini)
  $min = 0.0; [void][double]::TryParse([string]$t.c[$col['Tiempo de parada en minutos']], [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$min)
  $horas = 0.0; [void][double]::TryParse([string]$t.c[$col['Hora']], [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$horas)
  [void]$eventos.Add([ordered]@{
    id = Limpiar ([string]$t.c[$col['ID']])
    fecha = $fecha.ToString('yyyy-MM-dd HH:mm')
    turno = Limpiar ([string]$t.c[$col['Turno']])
    linea = Limpiar ([string]$t.c[$col['Línea']])
    maquina = Limpiar ([string]$t.c[$col['Máquina']])
    componente = Limpiar ([string]$t.c[$col['Componente']])
    tipo = Limpiar ([string]$t.c[$col['Tipo de PNP']])
    minutos = [Math]::Round($min, 2)
    horas = [Math]::Round($horas, 4)
    mecanismo = Mecanismo ([string]$t.c[$col['Mecanismo Falla']])
    descripcion = Recortar (Limpiar ([string]$t.c[$col['Descripción de parada no planeada']])) 500
    acciones = Recortar (Limpiar ([string]$t.c[$col['Acciones']])) 500
  })
}

# Unifica variantes de mayúsculas/acentos de un mismo texto usando la escritura más frecuente.
foreach ($campo in 'linea', 'maquina', 'componente', 'tipo') {
  $canon = @{}
  $eventos | Group-Object { (Quitar-Acentos ([string]$_[$campo])).ToLower() } | ForEach-Object {
    $mejor = $_.Group | Group-Object { [string]$_[$campo] } | Sort-Object Count -Descending | Select-Object -First 1
    $canon[$_.Name] = $mejor.Name
  }
  foreach ($e in $eventos) { $e[$campo] = $canon[(Quitar-Acentos ([string]$e[$campo])).ToLower()] }
}

$payload = [ordered]@{
  generado = (Get-Date).ToString('yyyy-MM-dd HH:mm')
  total = $eventos.Count
  eventos = $eventos
}
$json = $payload | ConvertTo-Json -Depth 4 -Compress
[IO.File]::WriteAllText((Join-Path (Resolve-Path (Split-Path $Salida)) (Split-Path $Salida -Leaf)), $json, (New-Object Text.UTF8Encoding($false)))
"Eventos: $($eventos.Count) -> $Salida"
