# 3D Puzzle VR - APK build (no Gradle: aapt2 + javac + d8 + zipalign + apksigner)
# Requires: android-sdk\ with cmdline-tools / platform-tools / platforms;android-33 / build-tools;33.0.2
#           JDK 17 (java on PATH). Same pipeline as tools\build-apk.ps1, isolated outputs.
# NOTE: this file must stay UTF-8 **with BOM** (see tools\fix-bom.ps1) so Windows
#       PowerShell 5.1 parses the Chinese filenames correctly.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File tools\build-apk-puzzle.ps1
$ErrorActionPreference = 'Stop'
$ROOT = Split-Path -Parent $PSScriptRoot
$SDK = Join-Path $ROOT 'android-sdk'
$BT = Join-Path $SDK 'build-tools\33.0.2'
$AJ = Join-Path $SDK 'platforms\android-33\android.jar'
$WORK = Join-Path $ROOT 'apk-puzzle\build'
$OUT = Join-Path $ROOT 'dist'

New-Item -ItemType Directory -Force -Path $WORK, $OUT | Out-Null

# 0) Preflight
foreach ($f in (Join-Path $BT 'aapt2.exe'), (Join-Path $BT 'd8.bat'), (Join-Path $BT 'apksigner.bat'), (Join-Path $BT 'zipalign.exe'), $AJ) {
  if (-not (Test-Path $f)) { Write-Error "Missing $f - install Android SDK components first (see README)" }
}

# 0.5) Icon + single-file offline HTML
node (Join-Path $ROOT 'tools\make-icons-puzzle.mjs')
node (Join-Path $ROOT 'tools\make-offline-puzzle.mjs')
New-Item -ItemType Directory -Force -Path (Join-Path $WORK 'assets\game') | Out-Null
Copy-Item (Join-Path $OUT 'WanxiangGuixing-offline.html') (Join-Path $WORK 'assets\game\index.html') -Force

# 1) aapt2 compile resources + link -> base.apk
& (Join-Path $BT 'aapt2.exe') compile --dir (Join-Path $ROOT 'apk-puzzle\res') -o (Join-Path $WORK 'res.zip')
if ($LASTEXITCODE -ne 0) { Write-Error 'aapt2 compile failed' }
& (Join-Path $BT 'aapt2.exe') link `
  -o (Join-Path $WORK 'base.apk') `
  -I $AJ `
  --manifest (Join-Path $ROOT 'apk-puzzle\AndroidManifest.xml') `
  -A (Join-Path $WORK 'assets') `
  (Join-Path $WORK 'res.zip') --auto-add-overlay
if ($LASTEXITCODE -ne 0) { Write-Error 'aapt2 link failed' }

# 2) javac (UTF-8 source: MainActivity has Chinese UI strings)
$classes = Join-Path $WORK 'classes'
New-Item -ItemType Directory -Force -Path $classes | Out-Null
$srcs = Get-ChildItem -Recurse -Filter *.java (Join-Path $ROOT 'apk-puzzle\src') | ForEach-Object { $_.FullName }
& javac -encoding UTF-8 -source 8 -target 8 -bootclasspath $AJ -classpath $AJ -d $classes $srcs
if ($LASTEXITCODE -ne 0) { Write-Error 'javac failed' }

# 3) d8 -> classes.dex appended into base.apk
# build-tools 33.0.2 d8.bat uses JDK8 java.ext.dirs (unsupported on JDK17) -> call main class directly
$d8lib = Join-Path $SDK 'build-tools\33.0.2\lib'
& java -cp "$d8lib\*" com.android.tools.r8.D8 --release --min-api 25 --lib $AJ --output $WORK (Get-ChildItem $classes -Recurse -Filter *.class | ForEach-Object { $_.FullName })
if ($LASTEXITCODE -ne 0) { Write-Error 'd8 failed' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$apkPath = Join-Path $WORK 'base.apk'
$zip = [System.IO.Compression.ZipFile]::Open($apkPath, 'Update')
$entry = $zip.CreateEntry('classes.dex')
$fs = [System.IO.File]::OpenRead((Join-Path $WORK 'classes.dex'))
$fs.CopyTo($entry.Open())
$fs.Close()
$zip.Dispose()

# 4) Normalize zip entry separators (.NET ZipFile keeps backslashes; Android requires '/')
$aligned = Join-Path $WORK 'aligned.apk'
$tmpFix = Join-Path $WORK 'fixed.apk'
$src = [System.IO.Compression.ZipFile]::OpenRead($apkPath)
$dst = [System.IO.Compression.ZipFile]::Open($tmpFix, 'Create')
foreach ($e in $src.Entries) {
  $ne = $dst.CreateEntry($e.FullName.Replace('\', '/'))
  $s = $e.Open(); $d = $ne.Open(); $s.CopyTo($d); $d.Close(); $s.Close()
}
$dst.Dispose(); $src.Dispose()
Move-Item $tmpFix $apkPath -Force
& (Join-Path $BT 'zipalign.exe') -f 4 $apkPath $aligned
if ($LASTEXITCODE -ne 0) { Write-Error 'zipalign failed' }

# 5) Sign (dedicated keystore + local password file; independent from RandomWalk VR app)
$keystore = Join-Path $ROOT 'apk-puzzle\debug.keystore'
$passFile = Join-Path $ROOT 'apk-puzzle\keystore.pass'
if (-not (Test-Path $passFile)) {
  [guid]::NewGuid().ToString('N').Substring(0, 20) | Set-Content -Path $passFile -Encoding ASCII
}
$pass = (Get-Content -Path $passFile -Raw).Trim()
if (-not (Test-Path $keystore)) {
  & keytool -genkeypair -keystore $keystore -storepass $pass -keypass $pass `
    -alias puzzle3d -keyalg RSA -keysize 2048 -validity 10950 `
    -dname 'CN=万象归形 Puzzle VR, OU=Dev, O=万象归形, C=CN'
  if ($LASTEXITCODE -ne 0) { Write-Error 'keytool failed' }
}
$final = Join-Path $OUT 'WanxiangGuixing.apk'
& (Join-Path $BT 'apksigner.bat') sign --ks $keystore --ks-pass "pass:$pass" --key-pass "pass:$pass" --out $final $aligned
if ($LASTEXITCODE -ne 0) { Write-Error 'apksigner failed' }

& (Join-Path $BT 'apksigner.bat') verify $final
Write-Host ""
Write-Host "OK APK built: $final ($([Math]::Round((Get-Item $final).Length/1KB,0)) KB)"
Write-Host "Install (enable USB debugging on headset, then):"
Write-Host "  $SDK\platform-tools\adb.exe install -r `"$final`""
