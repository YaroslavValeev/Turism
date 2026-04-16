param(
  [Parameter(Mandatory = $true)]
  [string]$ImageUrl
)

$ErrorActionPreference = "Stop"

function Write-Empty {
  Write-Output ""
  exit 0
}

if ([string]::IsNullOrWhiteSpace($ImageUrl)) {
  Write-Empty
}

$normalizedUrl = $ImageUrl.Trim()
if ($normalizedUrl.StartsWith("//")) {
  $normalizedUrl = "https:$normalizedUrl"
}

if (-not ($normalizedUrl -match '^https?://')) {
  Write-Empty
}

$tesseract = Get-Command tesseract -ErrorAction SilentlyContinue
if (-not $tesseract) {
  Write-Empty
}

$extension = [System.IO.Path]::GetExtension(($normalizedUrl -split '\?')[0])
if ([string]::IsNullOrWhiteSpace($extension)) {
  $extension = ".img"
}

$tempImage = Join-Path $env:TEMP ("mywave-ocr-" + [guid]::NewGuid().ToString() + $extension)

try {
  Invoke-WebRequest -Uri $normalizedUrl -OutFile $tempImage -UseBasicParsing | Out-Null
  $ocrOutput = & $tesseract.Source $tempImage stdout --psm 6 2>$null
  if ($ocrOutput) {
    Write-Output ($ocrOutput -join " ")
  } else {
    Write-Output ""
  }
} catch {
  Write-Output ""
} finally {
  if (Test-Path $tempImage) {
    Remove-Item -LiteralPath $tempImage -Force -ErrorAction SilentlyContinue
  }
}
