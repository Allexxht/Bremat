# BREMAT Központ – helyi rész (Windows 10/11, PowerShell 5.1, telepítés nélkül)
#
# Egy kis webszerver, ami CSAK ezen a gépen érhető el (http://localhost:47801/).
# A Valk oldalt adja: cellák → jigek → termékek, hozzájuk a saját adatok, jegyzetek és a
# fájlok (rajz, STEP, PDF) előnézettel, feltöltéssel, átnevezéssel, Lomtárba törléssel.
# A fájlok sosem mennek fel a netre: a böngésző innen, a gépről olvassa őket.
#
# Indítás: Kozpont.bat (vagy a Teendőim menüjéből). Ha már fut, csak megnyitja a böngészőt.
# Adatok: %APPDATA%\BrematKozpont\
#   beallitas.json  – a gyökérmappák (mappak: id, nev, ut)
#   adatok.json     – cellák, jigek, termékek, adatok, jegyzetek (a fájlok a helyükön maradnak)
#   mentes\         – az adatok.json napi mentései (60 napig)
#   kepek\          – a STEP-ből készült képek
param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$port = 47801
$base = "http://localhost:$port/"
$kozpont = 'https://bremat-stuff.netlify.app/?helyi=1'
$dir = Join-Path $env:APPDATA 'BrematKozpont'
$setFile = Join-Path $dir 'beallitas.json'
$dataFile = Join-Path $dir 'adatok.json'
$backupDir = Join-Path $dir 'mentes'
$thumbDir = Join-Path $dir 'kepek'
$logFile = Join-Path $dir 'hiba.txt'
foreach ($d in $dir, $backupDir, $thumbDir) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
$utf8 = New-Object System.Text.UTF8Encoding $false
$web = Join-Path $PSScriptRoot 'web'
$sep = [IO.Path]::DirectorySeparatorChar
Add-Type -AssemblyName Microsoft.VisualBasic

function Log($msg) { try { [IO.File]::AppendAllText($logFile, "$(Get-Date -Format s) $msg`r`n", $utf8) } catch {} }

# ---------- Csak egy példány fusson ----------
$mutex = New-Object Threading.Mutex($false, 'Local\BrematKozpontHelyi')
if (-not $mutex.WaitOne(0)) { if (-not $NoBrowser) { Start-Process $base }; exit }

# ---------- Beállítás: a gyökérmappák ----------
# Minden mappának állandó azonosítója (id) van: az adatok.json erre hivatkozik, így a
# sorrend vagy a megjelenő név változása nem töri el az összekötéseket.
function Slug($s) {
  $t = ([string]$s).Normalize([Text.NormalizationForm]::FormD)
  $t = -join ($t.ToCharArray() | Where-Object { [Globalization.CharUnicodeInfo]::GetUnicodeCategory($_) -ne 'NonSpacingMark' })
  $t = ($t.ToLowerInvariant() -replace '[^a-z0-9]+', '-').Trim('-')
  if (-not $t) { $t = 'mappa' }
  $t
}
function DefaultSettings {
  # Az Asztal a felhasználó mappájában; ha ott nincs Alex mappa (pl. OneDrive-os Asztal), a Windows szerinti Asztal
  $desk = Join-Path $env:USERPROFILE 'Desktop'
  if (-not (Test-Path -LiteralPath (Join-Path $desk 'Alex'))) { $desk = [Environment]::GetFolderPath('Desktop') }
  [ordered]@{ mappak = @(
    [ordered]@{ id = 'manipulator'; nev = 'Manipulátor'; ut = (Join-Path $desk 'Alex\manipulator') },
    [ordered]@{ id = 'products'; nev = 'Products'; ut = (Join-Path $desk 'Alex\Products') }
  ) }
}
function LoadSettings {
  if (-not (Test-Path $setFile)) { [IO.File]::WriteAllText($setFile, (ConvertTo-Json -InputObject (DefaultSettings) -Depth 4), $utf8) }
  $s = [IO.File]::ReadAllText($setFile, $utf8) | ConvertFrom-Json
  $list = New-Object System.Collections.ArrayList
  $seen = @{}
  foreach ($m in @($s.mappak)) {
    if (-not $m.ut) { continue }
    $full = [IO.Path]::GetFullPath([string]$m.ut).TrimEnd('\', '/')
    $name = $(if ($m.nev) { [string]$m.nev } else { Split-Path $full -Leaf })
    $id = $(if ($m.id -and ([string]$m.id) -match '^[a-z0-9_-]{1,40}$') { [string]$m.id } else { Slug $name })
    while ($seen.ContainsKey($id)) { $id = "$id-2" }
    $seen[$id] = $true
    [void]$list.Add([pscustomobject]@{ id = $id; name = $name; path = $full })
  }
  $script:roots = $list
}
function SaveSettings($mappak) {
  $out = New-Object System.Collections.ArrayList; $seen = @{}
  foreach ($m in @($mappak)) {
    $ut = ([string]$m.ut).Trim().Trim('"')
    if (-not $ut) { continue }
    if (-not [IO.Path]::IsPathRooted($ut)) { throw "BAD:Teljes útvonal kell: $ut" }
    if (-not [IO.Directory]::Exists($ut)) { throw "BAD:Nincs ilyen mappa: $ut" }
    $nev = ([string]$m.nev).Trim(); if (-not $nev) { $nev = Split-Path $ut -Leaf }
    $id = [string]$m.id; if ($id -notmatch '^[a-z0-9_-]{1,40}$') { $id = Slug $nev }
    while ($seen.ContainsKey($id)) { $id = "$id-2" }; $seen[$id] = $true
    [void]$out.Add([ordered]@{ id = $id; nev = $nev; ut = $ut })
  }
  [IO.File]::WriteAllText($setFile, (ConvertTo-Json -InputObject ([ordered]@{ mappak = @($out) }) -Depth 4), $utf8)
  LoadSettings; $script:index = $null
}
LoadSettings

# Minden indításkor új, véletlen kulcs: a fájlok címe csak ezzel működik, így egy idegen
# weboldal a böngészőben akkor sem tudja letölteni őket, ha kitalálja az útvonalat.
$token = [Guid]::NewGuid().ToString('N')

# ---------- Útvonalak ----------
# A böngésző mindig (mappa azonosítója, relatív út) párt küld. Ami a mappán kívülre vezetne
# (..\, C:\..., \\szerver\...), azt elutasítjuk.
function RootOf($r) {
  foreach ($x in $script:roots) { if ($x.id -eq [string]$r) { return $x } }
  throw 'NOTFOUND'
}
function ResolvePath($r, $p) {
  $root = (RootOf $r).path
  $rel = ([string]$p).Replace('/', $sep).TrimStart('\', '/')
  if ($rel -match ':' -or $rel.StartsWith('\\')) { throw 'NOTFOUND' }
  $full = [IO.Path]::GetFullPath([IO.Path]::Combine($root, $rel)).TrimEnd('\', '/')
  if ($full -ne $root -and -not $full.StartsWith($root + $sep, [StringComparison]::OrdinalIgnoreCase)) { throw 'NOTFOUND' }
  $full
}
function RelOf($root, $full) {
  if ($full.Length -le $root.Length) { return '' }
  $full.Substring($root.Length + 1).Replace($sep, '/')
}
function UnixMs($dt) { [int64]([DateTimeOffset]::new($dt.ToUniversalTime())).ToUnixTimeMilliseconds() }
function Hidden($fi) { ($fi.Attributes -band [IO.FileAttributes]::Hidden) -or ($fi.Attributes -band [IO.FileAttributes]::System) -or $fi.Name.StartsWith('~$') }
# Fájl- vagy mappanév: nem lehet benne út, és a Windows tiltott jelei sem.
function CheckName($n) {
  $n = ([string]$n).Trim()
  if (-not $n -or $n -eq '.' -or $n -eq '..' -or $n.IndexOfAny([IO.Path]::GetInvalidFileNameChars()) -ge 0 -or $n.Length -gt 200) { throw 'BAD:Érvénytelen név.' }
  $n.TrimEnd('.', ' ')
}
function FreeName($dirFull, $name) {
  $stem = [IO.Path]::GetFileNameWithoutExtension($name); $ext = [IO.Path]::GetExtension($name)
  $i = 2; $cand = $name
  while ([IO.File]::Exists((Join-Path $dirFull $cand)) -or [IO.Directory]::Exists((Join-Path $dirFull $cand))) { $cand = "$stem ($i)$ext"; $i++ }
  $cand
}

function EntryOf($fi, $root) {
  $isDir = [bool]($fi.Attributes -band [IO.FileAttributes]::Directory)
  [ordered]@{ n = $fi.Name; p = (RelOf $root $fi.FullName); d = $isDir
    s = $(if ($isDir) { 0 } else { [int64]$fi.Length }); m = UnixMs $fi.LastWriteTime }
}
function ListDir($r, $p) {
  $full = ResolvePath $r $p
  if (-not [IO.Directory]::Exists($full)) { throw 'NOTFOUND' }
  $root = (RootOf $r).path
  $out = New-Object System.Collections.ArrayList
  foreach ($fi in (New-Object IO.DirectoryInfo $full).GetFileSystemInfos()) {
    if (Hidden $fi) { continue }
    [void]$out.Add((EntryOf $fi $root))
  }
  [ordered]@{ path = (RelOf $root $full); entries = @($out) }
}
# Egy mappa összes fájlja (almappákkal együtt) – a jig / termék Fájlok részéhez.
function TreeOf($r, $p) {
  $full = ResolvePath $r $p
  if (-not [IO.Directory]::Exists($full)) { throw 'NOTFOUND' }
  $root = (RootOf $r).path
  $out = New-Object System.Collections.ArrayList; $more = $false
  foreach ($fi in (Get-ChildItem -LiteralPath $full -Recurse -Force -ErrorAction SilentlyContinue)) {
    if (Hidden $fi) { continue }
    if ($out.Count -ge 3000) { $more = $true; break }
    [void]$out.Add((EntryOf $fi $root))
  }
  [ordered]@{ entries = @($out); more = $more }
}

# Kereséshez egy egyszerű lista minden fájlról; 60 másodpercig érvényes (módosításkor újra).
$script:index = $null; $script:indexAt = [DateTime]::MinValue
function BuildIndex {
  if ($script:index -and ((Get-Date) - $script:indexAt).TotalSeconds -lt 60) { return $script:index }
  $all = New-Object System.Collections.ArrayList
  foreach ($rt in $script:roots) {
    if (-not [IO.Directory]::Exists($rt.path)) { continue }
    foreach ($fi in (Get-ChildItem -LiteralPath $rt.path -Recurse -Force -ErrorAction SilentlyContinue)) {
      if (Hidden $fi) { continue }
      $isDir = $fi.PSIsContainer
      $rel = RelOf $rt.path $fi.FullName
      [void]$all.Add([pscustomobject]@{ r = $rt.id; p = $rel; low = $rel.ToLowerInvariant(); n = $fi.Name; d = $isDir
        s = $(if ($isDir) { 0 } else { [int64]$fi.Length }); m = (UnixMs $fi.LastWriteTime) })
    }
  }
  $script:index = $all; $script:indexAt = Get-Date
  $all
}
function Search($q) {
  $words = @(([string]$q).ToLowerInvariant() -split '\s+' | Where-Object { $_ })
  if (-not $words.Count) { return [ordered]@{ hits = @(); more = $false } }
  $hits = New-Object System.Collections.ArrayList; $more = $false
  foreach ($e in (BuildIndex)) {
    $ok = $true
    foreach ($w in $words) { if (-not $e.low.Contains($w)) { $ok = $false; break } }
    if (-not $ok) { continue }
    if ($hits.Count -ge 300) { $more = $true; break }
    [void]$hits.Add([ordered]@{ r = $e.r; p = $e.p; n = $e.n; d = $e.d; s = $e.s; m = $e.m })
  }
  [ordered]@{ hits = @($hits); more = $more }
}

# ---------- Adatok (cellák, jigek, termékek) ----------
# A böngésző mindig a teljes adatot küldi; a szerver nem alakítja át, csak ellenőrzi, hogy
# érvényes JSON, és elmenti. A „rev” szám véd az ellen, hogy egy régebbi lap felülírja az újabbat.
$script:rev = [int64]0
if (Test-Path $dataFile) { $script:rev = (Get-Item $dataFile).LastWriteTimeUtc.Ticks }
function SaveData($text) {
  $null = $text | ConvertFrom-Json   # ha nem JSON, kivételt dob
  $today = Get-Date -Format 'yyyy-MM-dd'
  $bk = Join-Path $backupDir "adatok-$today.json"
  if ((Test-Path $dataFile) -and -not (Test-Path $bk)) {
    Copy-Item -LiteralPath $dataFile -Destination $bk
    Get-ChildItem -LiteralPath $backupDir -Filter 'adatok-*.json' | Sort-Object Name -Descending | Select-Object -Skip 60 | Remove-Item -Force -ErrorAction SilentlyContinue
  }
  $tmp = "$dataFile.tmp"
  [IO.File]::WriteAllText($tmp, $text, $utf8)
  if (Test-Path $dataFile) { [IO.File]::Replace($tmp, $dataFile, [NullString]::Value) } else { [IO.File]::Move($tmp, $dataFile) }
  $script:rev = [Math]::Max($script:rev + 1, (Get-Item $dataFile).LastWriteTimeUtc.Ticks)
}

# ---------- Válaszok ----------
$types = @{
  '.pdf' = 'application/pdf'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'
  '.gif' = 'image/gif'; '.webp' = 'image/webp'; '.bmp' = 'image/bmp'; '.txt' = 'text/plain; charset=utf-8'
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'; '.wasm' = 'application/wasm'
}
function Head($res, $code, $type) {
  $res.StatusCode = $code; $res.ContentType = $type
  $res.Headers.Set('Cache-Control', 'no-store')
  $res.Headers.Set('X-Content-Type-Options', 'nosniff')
  $res.Headers.Set('X-Frame-Options', 'SAMEORIGIN')
  $res.Headers.Set('Referrer-Policy', 'no-referrer')
}
function SendBytes($ctx, $code, $type, [byte[]]$bytes) {
  $res = $ctx.Response; Head $res $code $type
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
}
function SendText($ctx, $code, $text) { SendBytes $ctx $code 'application/json; charset=utf-8' ($utf8.GetBytes($text)) }
function SendJson($ctx, $code, $obj) { SendText $ctx $code (ConvertTo-Json -InputObject $obj -Depth 6 -Compress) }
function SendErr($ctx, $code, $msg) { SendJson $ctx $code ([ordered]@{ error = $msg }) }
function Ok($ctx) { SendJson $ctx 200 ([ordered]@{ ok = $true }) }

function SendFile($ctx, $full, $mode) {
  $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
  $res = $ctx.Response
  if ($mode -eq 'static') { $type = $types[$ext]; if (-not $type) { $type = 'application/octet-stream' } }
  else {
    # A mappákból csak azt mutatjuk a böngészőben, ami biztonságos (PDF, kép, szöveg).
    # Minden más (STEP, STL, HTML, SVG…) nyers adatként megy: a 3D nézet így olvassa be,
    # és egy fájl tartalma sem futhat programként az oldalon.
    $safe = @('.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.txt')
    $type = $(if ($safe -contains $ext) { $types[$ext] } else { 'application/octet-stream' })
  }
  $fs = [IO.File]::Open($full, 'Open', 'Read', 'ReadWrite')
  try {
    Head $res 200 $type
    if ($mode -eq 'file') {
      $name = [Uri]::EscapeDataString([IO.Path]::GetFileName($full))
      $res.Headers.Set('Content-Disposition', "inline; filename*=UTF-8''$name")
      if ($type -ne 'application/pdf') { $res.Headers.Set('Content-Security-Policy', 'sandbox') }
    }
    $res.ContentLength64 = $fs.Length
    $fs.CopyTo($res.OutputStream, 262144)
  } finally { $fs.Dispose() }
}

function ReadText($req) {
  $sr = New-Object IO.StreamReader($req.InputStream, $utf8)
  try { $sr.ReadToEnd() } finally { $sr.Dispose() }
}
function ReadBody($req) { $t = ReadText $req; if (-not $t) { return $null }; $t | ConvertFrom-Json }

# ---------- Fájlműveletek ----------
function Upload($req, $q) {
  $dirFull = ResolvePath $q['r'] $q['p']
  if (-not [IO.Directory]::Exists($dirFull)) { throw 'NOTFOUND' }
  $name = CheckName $q['name']
  $target = Join-Path $dirFull $name
  if ([IO.Directory]::Exists($target)) { throw 'BAD:Ilyen nevű mappa már van.' }
  if ([IO.File]::Exists($target)) {
    if ($q['mode'] -eq 'rename') { $name = FreeName $dirFull $name; $target = Join-Path $dirFull $name }
    elseif ($q['mode'] -ne 'overwrite') { throw 'EXISTS' }
  }
  $tmp = Join-Path $dirFull ('~$feltoltes-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
  $fs = [IO.File]::Create($tmp)
  try { $req.InputStream.CopyTo($fs, 262144) } finally { $fs.Dispose() }
  if ([IO.File]::Exists($target)) { [IO.File]::Delete($target) }
  [IO.File]::Move($tmp, $target)
  $script:index = $null
  [ordered]@{ ok = $true; name = $name }
}
function DoRename($b) {
  $full = ResolvePath $b.r $b.p
  if ($full -eq (RootOf $b.r).path) { throw 'BAD:A gyökérmappát a Beállításokban lehet átnevezni.' }
  $name = CheckName $b.name
  $target = Join-Path (Split-Path $full) $name
  if ($target -eq $full) { return }
  $caseOnly = $target.Equals($full, [StringComparison]::OrdinalIgnoreCase)
  if (-not $caseOnly -and ([IO.File]::Exists($target) -or [IO.Directory]::Exists($target))) { throw 'BAD:Ilyen nevű fájl vagy mappa már van.' }
  if ([IO.Directory]::Exists($full)) {
    if ($caseOnly) { $t2 = "$full.~atnevezes"; [IO.Directory]::Move($full, $t2); [IO.Directory]::Move($t2, $target) } else { [IO.Directory]::Move($full, $target) }
  } elseif ([IO.File]::Exists($full)) { [IO.File]::Move($full, $target) } else { throw 'NOTFOUND' }
  $script:index = $null
}
function DoMove($b) {
  $full = ResolvePath $b.r $b.p
  if ($full -eq (RootOf $b.r).path) { throw 'BAD:A gyökérmappa nem helyezhető át.' }
  $dest = ResolvePath $b.toR $b.toP
  if (-not [IO.Directory]::Exists($dest)) { throw 'NOTFOUND' }
  $target = Join-Path $dest (Split-Path $full -Leaf)
  if ($target -eq $full) { return }
  if ([IO.File]::Exists($target) -or [IO.Directory]::Exists($target)) { throw 'BAD:A célmappában már van ilyen nevű.' }
  if ([IO.Directory]::Exists($full)) {
    if ($dest.StartsWith($full + $sep, [StringComparison]::OrdinalIgnoreCase) -or $dest -eq $full) { throw 'BAD:Egy mappa nem tehető önmagába.' }
    [Microsoft.VisualBasic.FileIO.FileSystem]::MoveDirectory($full, $target)
  } elseif ([IO.File]::Exists($full)) { [Microsoft.VisualBasic.FileIO.FileSystem]::MoveFile($full, $target) } else { throw 'NOTFOUND' }
  $script:index = $null
}
function DoDelete($b) {
  $full = ResolvePath $b.r $b.p
  if ($full -eq (RootOf $b.r).path) { throw 'BAD:A gyökérmappa nem törölhető.' }
  # Lomtárba: onnan a Windows-ban visszaállítható
  if ([IO.Directory]::Exists($full)) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($full, 'OnlyErrorDialogs', 'SendToRecycleBin') }
  elseif ([IO.File]::Exists($full)) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($full, 'OnlyErrorDialogs', 'SendToRecycleBin') }
  else { throw 'NOTFOUND' }
  $script:index = $null
}
function DoMkdir($b) {
  $dirFull = ResolvePath $b.r $b.p
  if (-not [IO.Directory]::Exists($dirFull)) { throw 'NOTFOUND' }
  $name = CheckName $b.name
  $target = Join-Path $dirFull $name
  if ([IO.File]::Exists($target) -or [IO.Directory]::Exists($target)) { throw 'BAD:Ilyen nevű fájl vagy mappa már van.' }
  [void][IO.Directory]::CreateDirectory($target)
  $script:index = $null
  [ordered]@{ ok = $true; p = (RelOf (RootOf $b.r).path $target) }
}
function SaveThumb($req, $id) {
  if ([string]$id -notmatch '^[a-z0-9-]{1,60}$') { throw 'BAD:Hibás azonosító.' }
  $ms = New-Object IO.MemoryStream
  $req.InputStream.CopyTo($ms)
  $bytes = $ms.ToArray()
  if ($bytes.Length -lt 8 -or $bytes.Length -gt 8MB -or $bytes[0] -ne 0x89 -or $bytes[1] -ne 0x50) { throw 'BAD:Csak PNG kép lehet.' }
  [IO.File]::WriteAllBytes((Join-Path $thumbDir "$id.png"), $bytes)
}

# ---------- Kérések ----------
function Handle($ctx) {
  $req = $ctx.Request
  # Csak a saját címünkre érkező kérést szolgáljuk ki (más weboldal ne tudjon álcázva bejönni).
  if ($req.Headers['Host'] -ne "localhost:$port") { SendErr $ctx 400 'Hibás cím.'; return }
  $origin = $req.Headers['Origin']
  if ($origin -and $origin -ne "http://localhost:$port") { SendErr $ctx 403 'Tiltott.'; return }
  $path = $req.Url.AbsolutePath
  $q = $req.QueryString

  # Statikus oldal (a web mappából)
  if ($req.HttpMethod -eq 'GET' -and -not $path.StartsWith('/api/') -and $path -ne '/f' -and $path -ne '/kep') {
    $name = $(if ($path -eq '/') { 'index.html' } else { $path.TrimStart('/') })
    if ($name -notmatch '^(lib/)?[A-Za-z0-9][A-Za-z0-9._-]*$') { SendErr $ctx 404 'Nincs ilyen.'; return }
    $full = Join-Path $web ($name.Replace('/', $sep))
    if (-not [IO.File]::Exists($full)) { SendErr $ctx 404 'Nincs ilyen.'; return }
    SendFile $ctx $full 'static'; return
  }

  # Fájl a mappákból és a STEP-képek: csak a kulccsal (t=), amit az oldal az /api/init-ből kap.
  if (($path -eq '/f' -or $path -eq '/kep') -and $req.HttpMethod -eq 'GET') {
    if ($q['t'] -ne $token) { SendErr $ctx 403 'Lejárt. Töltsd újra az oldalt.'; return }
    if ($path -eq '/kep') {
      if ([string]$q['id'] -notmatch '^[a-z0-9-]{1,60}$') { throw 'NOTFOUND' }
      $full = Join-Path $thumbDir "$($q['id']).png"
    } else { $full = ResolvePath $q['r'] $q['p'] }
    if (-not [IO.File]::Exists($full)) { throw 'NOTFOUND' }
    SendFile $ctx $full $(if ($path -eq '/kep') { 'static' } else { 'file' }); return
  }

  # API: csak a saját oldalunkról (egyedi fejléc – idegen oldal ezt nem tudja elküldeni).
  if ($req.Headers['X-Helyi'] -ne '1') { SendErr $ctx 403 'Tiltott.'; return }
  $isPost = $req.HttpMethod -eq 'POST'
  switch ($path) {
    '/api/init' {
      $rs = @(foreach ($x in $script:roots) { [ordered]@{ id = $x.id; name = $x.name; path = $x.path; ok = [IO.Directory]::Exists($x.path) } })
      SendJson $ctx 200 ([ordered]@{ token = $token; roots = $rs; dir = $dir; kozpont = $kozpont }); return
    }
    '/api/list' { SendJson $ctx 200 (ListDir $q['r'] $q['p']); return }
    '/api/tree' { SendJson $ctx 200 (TreeOf $q['r'] $q['p']); return }
    '/api/search' { SendJson $ctx 200 (Search $q['q']); return }
    '/api/data' {
      if (-not $isPost) {
        $raw = $(if (Test-Path $dataFile) { [IO.File]::ReadAllText($dataFile, $utf8) } else { 'null' })
        SendText $ctx 200 ('{"rev":"' + $script:rev + '","data":' + $raw + '}'); return
      }
      if ([string]$req.Headers['X-Rev'] -ne [string]$script:rev) { SendErr $ctx 409 'Közben máshol módosult. Frissítettem, próbáld újra.'; return }
      SaveData (ReadText $req)
      SendText $ctx 200 ('{"ok":true,"rev":"' + $script:rev + '"}'); return
    }
  }
  if (-not $isPost) { SendErr $ctx 404 'Nincs ilyen.'; return }
  switch ($path) {
    '/api/upload' { SendJson $ctx 200 (Upload $req $q); return }
    '/api/kep' { SaveThumb $req $q['id']; Ok $ctx; return }
  }
  $b = ReadBody $req
  switch ($path) {
    '/api/open' {
      $full = ResolvePath $b.r $b.p
      if ($b.mode -eq 'folder') {
        if ([IO.File]::Exists($full)) { Start-Process 'explorer.exe' -ArgumentList "/select,`"$full`"" }
        elseif ([IO.Directory]::Exists($full)) { Start-Process 'explorer.exe' -ArgumentList "`"$full`"" }
        else { throw 'NOTFOUND' }
      } else {
        if (-not [IO.File]::Exists($full)) { throw 'NOTFOUND' }
        try { Start-Process -FilePath $full } catch { throw 'BAD:Ehhez a fájltípushoz nincs program beállítva a gépen.' }
      }
      Ok $ctx; return
    }
    '/api/rename' { DoRename $b; Ok $ctx; return }
    '/api/move' { DoMove $b; Ok $ctx; return }
    '/api/delete' { DoDelete $b; Ok $ctx; return }
    '/api/mkdir' { SendJson $ctx 200 (DoMkdir $b); return }
    '/api/roots' { SaveSettings $b.mappak; Ok $ctx; return }
    '/api/stop' { Ok $ctx; $script:stop = $true; return }
  }
  SendErr $ctx 404 'Nincs ilyen.'
}

# ---------- Indítás ----------
$listener = New-Object Net.HttpListener
$listener.Prefixes.Add($base)
try { $listener.Start() } catch {
  Log "Nem indult el a helyi szerver: $($_.Exception.Message)"
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show("A BREMAT Központ helyi része nem indult el.`n`n$($_.Exception.Message)", 'BREMAT Központ') | Out-Null
  exit 1
}
if (-not $NoBrowser) { Start-Process $base }
$script:stop = $false
while ($listener.IsListening -and -not $script:stop) {
  $ctx = $listener.GetContext()
  try { Handle $ctx }
  catch {
    $m = "$($_.Exception.Message)"
    try {
      if ($m -eq 'NOTFOUND') { SendErr $ctx 404 'Nincs ilyen fájl vagy mappa.' }
      elseif ($m -eq 'EXISTS') { SendErr $ctx 409 'Ilyen nevű fájl már van.' }
      elseif ($m.StartsWith('BAD:')) { SendErr $ctx 400 $m.Substring(4) }
      else { Log "$($ctx.Request.Url.AbsolutePath): $m"; SendErr $ctx 500 "Hiba: $m" }
    } catch {}
  }
  finally { try { $ctx.Response.Close() } catch {} }
}
$listener.Stop()
$mutex.ReleaseMutex()
