param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$InputPath,
  [Parameter(Position = 1)]
  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$inputFile = Get-Item -LiteralPath $InputPath -ErrorAction Stop
if ($inputFile.PSIsContainer) { throw 'InputPath must be a media file.' }
$ffmpegCommand = Get-Command ffmpeg -ErrorAction SilentlyContinue
if (-not $ffmpegCommand) { throw 'FFmpeg is required. Install FFmpeg and add it to PATH first.' }
if (-not $OutputPath) {
  $OutputPath = Join-Path $inputFile.DirectoryName ($inputFile.BaseName + '.mp3')
}
if ([System.IO.Path]::GetExtension($OutputPath) -ine '.mp3') { throw 'OutputPath must end in .mp3.' }
$outputFile = [System.IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $outputFile) { throw 'Output already exists. Choose another output file.' }
& $ffmpegCommand.Source -nostdin -hide_banner -loglevel error -n -i $inputFile.FullName -vn -codec:a libmp3lame -q:a 2 $outputFile
if ($LASTEXITCODE -ne 0) { throw "FFmpeg conversion failed with exit code $LASTEXITCODE." }
Get-Item -LiteralPath $outputFile | Select-Object FullName, Length
