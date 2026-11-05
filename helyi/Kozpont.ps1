# BREMAT Központ – helyi rész (Windows 10/11, PowerShell 5.1, telepítés nélkül)
#
# Egy kis webszerver, ami CSAK ezen a gépen érhető el (http://localhost:47801/).
# A Valk fájlok oldalát adja: a beállított mappák fája, kereső, PDF / STEP / STL előnézet,
# megnyitás a saját programmal. A fájlok sosem mennek fel a netre: a böngésző innen,
# a gépről olvassa őket. A napló, a heti lap és a projektek a webes Központban maradnak.
#
# Indítás: Kozpont.bat (vagy a Teendőim menüjéből). Ha már fut, csak megnyitja a böngészőt.
# Beállítás: %APPDATA%\BrematKozpont\beallitas.json (a mappák listája: "mappak").
param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$port = 47801
$base = "http://localhost:$port/"
$kozpont = 'https://bremat-stuff.netlify.app/?helyi=1'
$dir = Join-Path $env:APPDATA 'BrematKozpont'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$setFile = Join-Path $dir 'beallitas.json'
$logFile = Join-Path $dir 'hiba.txt'
$utf8 = New-Object System.Text.UTF8Encoding $false
$web = Join-Path $PSScriptRoot 'web'
$sep = [IO.Path]::DirectorySeparatorChar

function Log($msg) { try { [IO.File]::AppendAllText($logFile, "$(Get-Date -Format s) $msg`r`n", $utf8) } catch {} }

# ---------- Csak egy példány fusson ----------
$mutex = New-Object Threading.Mutex($false, 'Local\BrematKozpontHelyi')
if (-not $mutex.WaitOne(0)) { if (-not $NoBrowser) { Start-Process $base }; exit }

# ---------- Beállítás: a mappák ----------
function LoadSettings {
  if (-not (Test-Path $setFile)) {
    # Az Asztal a felhasználó mappájában; ha ott nincs Alex mappa (pl. OneDrive-os Asztal), a Windows szerinti Asztal
    $desk = Join-Path $env:USERPROFILE 'Desktop'
    if (-not (Test-Path -LiteralPath (Join-Path $desk 'Alex'))) { $desk = [Environment]::GetFolderPath('Desktop') }
    $def = [ordered]@{ mappak = @(
      [ordered]@{ nev = 'Manipulátor'; ut = (Join-Path $desk 'Alex\manipulator') },
      [ordered]@{ nev = 'Products'; ut = (Join-Path $desk 'Alex\Products') }
    ) }
    [IO.File]::WriteAllText($setFile, (ConvertTo-Json -InputObject $def -Depth 4), $utf8)
  }
  $s = [IO.File]::ReadAllText($setFile, $utf8) | ConvertFrom-Json
  $list = New-Object System.Collections.ArrayList
  foreach ($m in @($s.mappak)) {
    if (-not $m.ut) { continue }
    $full = [IO.Path]::GetFullPath([string]$m.ut).TrimEnd('\', '/')
    $name = $(if ($m.nev) { [string]$m.nev } else { Split-Path $full -Leaf })
    [void]$list.Add([pscustomobject]@{ name = $name; path = $full })
  }
  $script:roots = $list
}
LoadSettings

# Minden indításkor új, véletlen kulcs: a fájlok címe csak ezzel működik, így egy idegen
# weboldal a böngészőben akkor sem tudja letölteni őket, ha kitalálja az útvonalat.
$token = [Guid]::NewGuid().ToString('N')

# ---------- Útvonalak ----------
# A böngésző mindig (mappa sorszáma, relatív út) párt küld. Ami a mappán kívülre vezetne
# (..\, C:\..., \\szerver\...), azt elutasítjuk.
function ResolvePath($r, $p) {
  $i = 0
  if (-not [int]::TryParse([string]$r, [ref]$i) -or $i -lt 0 -or $i -ge $script:roots.Count) { throw 'NOTFOUND' }
  $root = $script:roots[$i].path
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

function ListDir($r, $p) {
  $full = ResolvePath $r $p
  if (-not [IO.Directory]::Exists($full)) { throw 'NOTFOUND' }
  $root = $script:roots[[int]$r].path
  $out = New-Object System.Collections.ArrayList
  foreach ($fi in (New-Object IO.DirectoryInfo $full).GetFileSystemInfos()) {
    if (Hidden $fi) { continue }
    $isDir = [bool]($fi.Attributes -band [IO.FileAttributes]::Directory)
    [void]$out.Add([ordered]@{
      n = $fi.Name; d = $isDir
      s = $(if ($isDir) { 0 } else { [int64]$fi.Length })
      m = UnixMs $fi.LastWriteTime
    })
  }
  [ordered]@{ path = (RelOf $root $full); entries = @($out) }
}

# Kereséshez egy egyszerű lista minden fájlról; 60 másodpercig érvényes.
$script:index = $null; $script:indexAt = [DateTime]::MinValue
function BuildIndex {
  if ($script:index -and ((Get-Date) - $script:indexAt).TotalSeconds -lt 60) { return $script:index }
  $all = New-Object System.Collections.ArrayList
  for ($i = 0; $i -lt $script:roots.Count; $i++) {
    $root = $script:roots[$i].path
    if (-not [IO.Directory]::Exists($root)) { continue }
    foreach ($fi in (Get-ChildItem -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue)) {
      if (Hidden $fi) { continue }
      $isDir = $fi.PSIsContainer
      $rel = RelOf $root $fi.FullName
      [void]$all.Add([pscustomobject]@{ r = $i; p = $rel; low = $rel.ToLowerInvariant(); n = $fi.Name; d = $isDir
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
function SendJson($ctx, $code, $obj) { SendBytes $ctx $code 'application/json; charset=utf-8' ($utf8.GetBytes((ConvertTo-Json -InputObject $obj -Depth 6 -Compress))) }
function SendErr($ctx, $code, $msg) { SendJson $ctx $code ([ordered]@{ error = $msg }) }

function SendFile($ctx, $full, $asStatic) {
  $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
  $res = $ctx.Response
  if ($asStatic) { $type = $types[$ext]; if (-not $type) { $type = 'application/octet-stream' } }
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
    if (-not $asStatic) {
      $name = [Uri]::EscapeDataString([IO.Path]::GetFileName($full))
      $res.Headers.Set('Content-Disposition', "inline; filename*=UTF-8''$name")
      if ($type -ne 'application/pdf') { $res.Headers.Set('Content-Security-Policy', 'sandbox') }
    }
    $res.ContentLength64 = $fs.Length
    $fs.CopyTo($res.OutputStream, 262144)
  } finally { $fs.Dispose() }
}

function ReadBody($req) {
  $sr = New-Object IO.StreamReader($req.InputStream, $utf8)
  try { $t = $sr.ReadToEnd() } finally { $sr.Dispose() }
  if (-not $t) { return $null }
  $t | ConvertFrom-Json
}

# ---------- Kérések ----------
function Handle($ctx) {
  $req = $ctx.Request
  # Csak a saját címünkre érkező kérést szolgáljuk ki (más weboldal ne tudjon „álcázva” bejönni).
  if ($req.Headers['Host'] -ne "localhost:$port") { SendErr $ctx 400 'Hibás cím.'; return }
  $origin = $req.Headers['Origin']
  if ($origin -and $origin -ne "http://localhost:$port") { SendErr $ctx 403 'Tiltott.'; return }
  $path = $req.Url.AbsolutePath
  $q = $req.QueryString

  # Statikus oldal (a web mappából)
  if ($req.HttpMethod -eq 'GET' -and -not $path.StartsWith('/api/') -and $path -ne '/f') {
    $name = $(if ($path -eq '/') { 'index.html' } else { $path.TrimStart('/') })
    if ($name -notmatch '^(lib/)?[A-Za-z0-9][A-Za-z0-9._-]*$') { SendErr $ctx 404 'Nincs ilyen.'; return }
    $full = Join-Path $web ($name.Replace('/', $sep))
    if (-not [IO.File]::Exists($full)) { SendErr $ctx 404 'Nincs ilyen.'; return }
    SendFile $ctx $full $true; return
  }

  # Fájl a mappákból: csak a kulccsal (t=), amit az oldal az /api/init-ből kap.
  if ($path -eq '/f' -and $req.HttpMethod -eq 'GET') {
    if ($q['t'] -ne $token) { SendErr $ctx 403 'Lejárt. Töltsd újra az oldalt.'; return }
    $full = ResolvePath $q['r'] $q['p']
    if (-not [IO.File]::Exists($full)) { throw 'NOTFOUND' }
    SendFile $ctx $full $false; return
  }

  # API: csak a saját oldalunkról (egyedi fejléc – idegen oldal ezt nem tudja elküldeni).
  if ($req.Headers['X-Helyi'] -ne '1') { SendErr $ctx 403 'Tiltott.'; return }
  switch ($path) {
    '/api/init' {
      $rs = @(for ($i = 0; $i -lt $script:roots.Count; $i++) {
        [ordered]@{ i = $i; name = $script:roots[$i].name; ok = [IO.Directory]::Exists($script:roots[$i].path) } })
      SendJson $ctx 200 ([ordered]@{ token = $token; roots = $rs; settings = $setFile; kozpont = $kozpont }); return
    }
    '/api/list' { SendJson $ctx 200 (ListDir $q['r'] $q['p']); return }
    '/api/search' { SendJson $ctx 200 (Search $q['q']); return }
    '/api/open' {
      if ($req.HttpMethod -ne 'POST') { SendErr $ctx 405 'Csak POST.'; return }
      $b = ReadBody $req
      $full = ResolvePath $b.r $b.p
      if ($b.mode -eq 'folder') {
        if ([IO.File]::Exists($full)) { Start-Process 'explorer.exe' -ArgumentList "/select,`"$full`"" }
        elseif ([IO.Directory]::Exists($full)) { Start-Process 'explorer.exe' -ArgumentList "`"$full`"" }
        else { throw 'NOTFOUND' }
      } else {
        if (-not [IO.File]::Exists($full)) { throw 'NOTFOUND' }
        Start-Process -FilePath $full
      }
      SendJson $ctx 200 ([ordered]@{ ok = $true }); return
    }
    '/api/settings' {
      if ($req.HttpMethod -ne 'POST') { SendErr $ctx 405 'Csak POST.'; return }
      Start-Process 'notepad.exe' -ArgumentList "`"$setFile`""
      SendJson $ctx 200 ([ordered]@{ ok = $true }); return
    }
    '/api/reload' {
      if ($req.HttpMethod -ne 'POST') { SendErr $ctx 405 'Csak POST.'; return }
      LoadSettings; $script:index = $null
      SendJson $ctx 200 ([ordered]@{ ok = $true }); return
    }
    '/api/stop' {
      if ($req.HttpMethod -ne 'POST') { SendErr $ctx 405 'Csak POST.'; return }
      SendJson $ctx 200 ([ordered]@{ ok = $true }); $script:stop = $true; return
    }
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
    if ($m -eq 'NOTFOUND') { try { SendErr $ctx 404 'Nincs ilyen fájl vagy mappa.' } catch {} }
    else { Log "$($ctx.Request.Url.AbsolutePath): $m"; try { SendErr $ctx 500 'Hiba történt (részletek: hiba.txt).' } catch {} }
  }
  finally { try { $ctx.Response.Close() } catch {} }
}
$listener.Stop()
$mutex.ReleaseMutex()
