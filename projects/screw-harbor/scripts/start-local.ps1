param()
$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$PreviewUri = 'http://127.0.0.1:4188/'
$ExistingContent = $null
$ExistingResponse = $null
$Request = [System.Net.HttpWebRequest]::Create($PreviewUri)
$Request.Timeout = 2000
$Request.ReadWriteTimeout = 2000
try {
    $ExistingResponse = $Request.GetResponse()
} catch [System.Net.WebException] {
    if ($_.Exception.Response) {
        $ExistingResponse = $_.Exception.Response
    }
}

if ($ExistingResponse) {
    try {
        $Reader = New-Object System.IO.StreamReader($ExistingResponse.GetResponseStream())
        $ExistingContent = $Reader.ReadToEnd()
    } finally {
        if ($Reader) { $Reader.Dispose() }
        $ExistingResponse.Close()
    }

    if ($ExistingContent -match '<title\b[^>]*>\s*SCREW HARBOR\b') {
        Write-Host "SCREW HARBOR 미리보기가 이미 실행 중입니다: $PreviewUri"
        try { Start-Process $PreviewUri } catch { Write-Host '브라우저를 자동으로 열 수 없습니다. 위 주소를 직접 여세요.' }
        exit 0
    }

    Write-Error '127.0.0.1:4188 포트에 다른 웹 서비스가 응답했습니다. 기존 서비스를 종료하거나 미리보기 포트를 비운 뒤 다시 실행하세요. 기존 프로세스는 종료하지 않았습니다.'
    exit 1
}

$NodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($NodeCommand) {
    $NodeExe = $NodeCommand.Source
} else {
    $BundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    if (Test-Path -LiteralPath $BundledNode -PathType Leaf) {
        $NodeExe = $BundledNode
    } else {
        Write-Error 'Node.js를 찾지 못했습니다. Node.js 20.19+ 또는 Codex 번들 Node 경로를 확인하세요.'
        exit 1
    }
}

$ViteCli = Join-Path $ProjectRoot 'node_modules\vite\bin\vite.js'
$TscCli = Join-Path $ProjectRoot 'node_modules\typescript\bin\tsc.js'
$DistIndex = Join-Path $ProjectRoot 'dist\index.html'
if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot 'node_modules') -PathType Container) -or -not (Test-Path -LiteralPath $ViteCli -PathType Leaf)) {
    Write-Error '프로젝트 의존성이 설치되지 않았습니다. 자동 설치하지 않습니다. README의 npm install 또는 번들 pnpm 설치 안내를 먼저 따르세요.'
    exit 1
}

if (-not (Test-Path -LiteralPath $DistIndex -PathType Leaf)) {
    if (-not (Test-Path -LiteralPath $TscCli -PathType Leaf)) {
        Write-Error 'TypeScript 빌드 도구를 찾지 못했습니다. 의존성을 확인한 뒤 npm run build를 실행하세요.'
        exit 1
    }
    Push-Location $ProjectRoot
    try {
        & $NodeExe $TscCli
        if ($LASTEXITCODE -ne 0) { throw "TypeScript 검사 실패 ($LASTEXITCODE)" }
        & $NodeExe $ViteCli build
        if ($LASTEXITCODE -ne 0) { throw "Vite 빌드 실패 ($LASTEXITCODE)" }
    } finally {
        Pop-Location
    }
}

if (-not (Test-Path -LiteralPath $DistIndex -PathType Leaf)) {
    Write-Error '빌드가 끝났지만 dist/index.html을 찾지 못했습니다.'
    exit 1
}

Write-Host 'SCREW HARBOR 미리보기: http://127.0.0.1:4188'
Write-Host '종료하려면 Ctrl+C를 누르세요.'
Push-Location $ProjectRoot
try {
    & $NodeExe $ViteCli preview --host 127.0.0.1 --port 4188 --strictPort
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}


