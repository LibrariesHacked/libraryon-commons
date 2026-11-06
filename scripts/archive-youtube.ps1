# Archival script for all YouTube content referenced in libraryon-commons
param(
    [string]$YtDlpPath = "$HOME\Downloads\yt-dlp.exe",
    [string]$OutputDir = "archive\youtube"
)

# 1. Locate yt-dlp executable
$exe = $null
if (Test-Path $YtDlpPath) {
    $exe = $YtDlpPath
} elseif (Get-Command yt-dlp -ErrorAction SilentlyContinue) {
    $exe = "yt-dlp"
} else {
    Write-Host "Error: yt-dlp executable not found at $YtDlpPath or in PATH." -ForegroundColor Red
    Write-Host "Please ensure yt-dlp.exe is in your Downloads folder or specify -YtDlpPath." -ForegroundColor Yellow
    exit 1
}

Write-Host "Using yt-dlp: $exe" -ForegroundColor Green

# 2. Ensure output directory exists
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

# 3. Extract all unique YouTube URLs from repo
Write-Host "Extracting YouTube URLs from src/content..." -ForegroundColor Cyan
$files = Get-ChildItem -Path src\content\resources, src\content\pages, src\content\sessions -Recurse -Include *.json, *.md
$seen = [System.Collections.Generic.HashSet[string]]::new()
$urls = [System.Collections.Generic.List[string]]::new()

foreach ($f in $files) {
    $text = ([System.IO.File]::ReadAllText($f.FullName)) -replace '&amp;', '&'
    $matches = [regex]::Matches($text, 'https?://(?:www\.)?(?:youtube\.com/(?:watch\?v=|embed/|playlist\?list=)|youtu\.be/)[a-zA-Z0-9_\-]+(?:\?[^\s"''`)]+)?')
    foreach ($m in $matches) {
        $u = $m.Value.TrimEnd('.', ',', ';', '"', "'", ')')
        if ($seen.Add($u)) { $urls.Add($u) }
    }
}

# Add official LibraryOn YouTube channel to catch any content not listed on the site
$libraryOnChannel = "https://www.youtube.com/@LibraryOn."
if ($seen.Add($libraryOnChannel)) {
    $urls.Add($libraryOnChannel)
}

$urlFile = Join-Path $OutputDir "urls.txt"
$archiveLog = Join-Path $OutputDir "download-archive.txt"
$urls | Out-File -FilePath $urlFile -Encoding utf8
Write-Host "Found $($urls.Count) URLs (including LibraryOn channel). Saved to $urlFile" -ForegroundColor Green

# 4. Check if ffmpeg is available
$hasFfmpeg = [bool](Get-Command ffmpeg -ErrorAction SilentlyContinue)
if (-not $hasFfmpeg -and (Test-Path "$HOME\Downloads\ffmpeg.exe")) {
    $hasFfmpeg = $true
}

$embedArgs = @()
if ($hasFfmpeg) {
    Write-Host "ffmpeg detected: enabling post-processing & metadata embedding." -ForegroundColor Green
    $embedArgs = @("--merge-output-format", "mkv", "--embed-thumbnail", "--embed-metadata", "--embed-chapters")
} else {
    Write-Host "ffmpeg not detected: skipping post-processing container embedding (streams, thumbnails, info.json, subtitles, and descriptions will be saved as separate files)." -ForegroundColor Yellow
}

# 5. Execute yt-dlp archive download
Write-Host "Starting video downloads into $OutputDir..." -ForegroundColor Cyan

$baseArgs = @(
    "-a", $urlFile,
    "--download-archive", $archiveLog,
    "-f", "bv*+ba/b",
    "--write-description",
    "--write-info-json",
    "--write-thumbnail",
    "--write-subs",
    "--write-auto-subs",
    "--sub-langs", "en.*,en",
    "--yes-playlist",
    "--no-overwrites",
    "--ignore-errors",
    "--continue",
    "-o", "$OutputDir/%(uploader,channel)s/%(upload_date>%Y-%m-%d)s - %(title)s [%(id)s]/%(title)s [%(id)s].%(ext)s"
)

& $exe @baseArgs @embedArgs

Write-Host "`nArchival process completed." -ForegroundColor Green

