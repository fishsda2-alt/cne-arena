# 로컬 미리보기용 간이 정적 서버 (Windows 기본 PowerShell만 사용)
# 브라우저 보안 정책상 index.html을 더블클릭하면 data/ranking.json을 못 읽으므로 이 서버로 확인합니다.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8189
$prefix = "http://localhost:$port/"

$types = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".svg"  = "image/svg+xml"
  ".ico"  = "image/x-icon"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
} catch {
  Write-Host "포트 $port 를 열 수 없습니다. 다른 프로그램이 사용 중일 수 있습니다." -ForegroundColor Red
  Read-Host "엔터를 누르면 종료합니다"
  exit 1
}

Write-Host ""
Write-Host "  충남 아마추어 랭킹 - 로컬 미리보기" -ForegroundColor Cyan
Write-Host "  $prefix" -ForegroundColor Yellow
Write-Host "  종료하려면 이 창을 닫거나 Ctrl+C" -ForegroundColor DarkGray
Write-Host ""

Start-Process $prefix

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
  } catch { break }

  $res = $ctx.Response
  try {
    $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart("/")
    if ([string]::IsNullOrWhiteSpace($rel)) { $rel = "index.html" }

    $full = Join-Path $root $rel
    $resolvedRoot = (Resolve-Path $root).Path

    if (Test-Path $full -PathType Leaf) {
      $resolved = (Resolve-Path $full).Path
      # 루트 밖 파일 접근 차단
      if (-not $resolved.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        $res.StatusCode = 403
        $bytes = [System.Text.Encoding]::UTF8.GetBytes("403 Forbidden")
      } else {
        $ext = [System.IO.Path]::GetExtension($resolved).ToLower()
        $res.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { "application/octet-stream" }
        $res.Headers.Add("Cache-Control", "no-store")
        $bytes = [System.IO.File]::ReadAllBytes($resolved)
      }
    } else {
      $res.StatusCode = 404
      $res.ContentType = "text/html; charset=utf-8"
      $bytes = [System.Text.Encoding]::UTF8.GetBytes("<h1>404</h1><p>$rel</p>")
    }

    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch {
    Write-Host "요청 처리 오류: $_" -ForegroundColor DarkRed
  } finally {
    try { $res.OutputStream.Close() } catch {}
  }
}

$listener.Stop()
