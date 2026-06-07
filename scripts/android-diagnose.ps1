<#
.SYNOPSIS
    Anima 안드로이드 오류 진단 도구.

.DESCRIPTION
    개발해 둔 CrashReporter(util/CrashReporter.kt)는 비치명적 오류를 Logcat(Log.w) 과
    Crashlytics 양쪽에 보고한다. 그러나 *debug 빌드에서는 Crashlytics 수집이 꺼져 있으므로*
    (AnimaApplication.onCreate), 디버그 APK 의 오류는 **Logcat 으로만** 잡힌다.
    이 스크립트는 그 Logcat 경로를 자동화해 "사용 중 나는 오류"의 원인을 찾는다.

    동작 단계:
      install  : 연결된 기기에 최신 debug APK 를 재설치(-r, 버전 다운그레이드 허용 -d)
      capture  : logcat 을 비우고 앱을 띄운 뒤, 관련 로그를 파일로 스트리밍(재현하는 동안)
      analyze  : 캡처 파일에서 크래시/예외/CrashReporter 태그만 추려 요약
      all      : install → capture (Ctrl+C 로 종료) → analyze 를 순차 실행

.PARAMETER Action
    install | capture | analyze | all  (기본값: all)

.PARAMETER ApkPath
    설치할 APK. 생략 시 build/outputs 에서 가장 최근 debug APK 자동 선택.

.PARAMETER LogFile
    캡처/분석 대상 로그 파일. 생략 시 test-results\logcat-<timestamp>.txt.

.EXAMPLE
    .\scripts\android-diagnose.ps1                 # 전체 흐름
    .\scripts\android-diagnose.ps1 -Action capture # 캡처만 (재현하는 동안 켜두기)
    .\scripts\android-diagnose.ps1 -Action analyze -LogFile test-results\logcat-xxx.txt
#>
[CmdletBinding()]
param(
    [ValidateSet('install', 'capture', 'analyze', 'all')]
    [string]$Action = 'all',
    [string]$ApkPath,
    [string]$LogFile
)

$ErrorActionPreference = 'Stop'

# ── 상수 (매직 넘버/문자열 제거) ───────────────────────────────────────────────
$PackageName   = 'com.michaelkim.anima'
$MainActivity  = 'com.michaelkim.anima.MainActivity'
$ProjectRoot   = Split-Path -Parent $PSScriptRoot
$ApkSearchDir  = Join-Path $ProjectRoot 'android\app\build\outputs\apk\debug'
$ResultsDir    = Join-Path $ProjectRoot 'test-results'
$LaunchSettleMs = 1500   # 앱 콜드 스타트가 첫 로그를 뱉을 때까지의 여유

# CrashReporter / Log.x(TAG, ...) 가 쓰는 우리 앱 태그 + 크래시/예외 시스템 태그.
$AppTags = @(
    'FgWidgetRefresher', 'AuthBridgeActivity', 'MainActivity', 'SignOutBridge',
    'WidgetRefreshBridge', 'QuoteRepository', 'AffirmationsReminder',
    'QuoteRefreshWorker', 'AuthRepository', 'WinsReminder'
)
# 크래시/문제 신호 — 프로세스 무관하게 잡아야 하는 패턴(앱이 죽거나 ANR 일 때).
$CrashSignals = @(
    'FATAL EXCEPTION', 'AndroidRuntime', 'ANR in', 'CrashReporter',
    'Exception', 'Caused by:', 'at com.michaelkim.anima',
    'chromium.*ERROR', 'Console.*Uncaught', 'net::ERR_', 'StrictMode'
)

# ── 공통 유틸 ──────────────────────────────────────────────────────────────────
function Assert-Device {
    try {
        $out = & adb devices 2>&1 | Where-Object { $_ -match '\tdevice$' }
    } catch {
        throw "adb 실행 실패 — platform-tools 가 PATH 에 있는지 확인하세요. ($_)"
    }
    if (-not $out) {
        throw @"
연결된 기기가 없습니다. 다음을 확인하세요:
  1) 폰: 설정 > 휴대전화 정보 > 소프트웨어 정보 > '빌드 번호' 7번 탭 → 개발자 모드
  2) 폰: 설정 > 개발자 옵션 > 'USB 디버깅' ON
  3) USB 케이블 연결 후, 폰 화면의 'USB 디버깅 허용' 팝업 → 허용
  4) 'adb devices' 에 'device' 로 표시되는지 확인 (unauthorized 면 3번 팝업 재확인)
"@
    }
    $count = ($out | Measure-Object).Count
    if ($count -gt 1) {
        Write-Warning "기기가 $count 대 연결됨 — 첫 번째 기기를 사용합니다. 하나만 연결하길 권장."
    }
    Write-Host "[OK] 기기 연결 확인" -ForegroundColor Green
}

function Resolve-Apk {
    if ($ApkPath) {
        if (-not (Test-Path $ApkPath)) { throw "지정한 APK 없음: $ApkPath" }
        return (Resolve-Path $ApkPath).Path
    }
    if (-not (Test-Path $ApkSearchDir)) {
        throw "빌드된 debug APK 폴더 없음: $ApkSearchDir  (먼저 빌드하세요: cd android; .\gradlew assembleDebug)"
    }
    $apk = Get-ChildItem -Path $ApkSearchDir -Filter '*.apk' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $apk) { throw "debug APK 를 찾지 못함: $ApkSearchDir" }
    return $apk.FullName
}

function Resolve-LogFile {
    if ($LogFile) { return $LogFile }
    if (-not (Test-Path $ResultsDir)) { New-Item -ItemType Directory -Path $ResultsDir | Out-Null }
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    return (Join-Path $ResultsDir "logcat-$stamp.txt")
}

# ── 액션 구현 ──────────────────────────────────────────────────────────────────
function Invoke-Install {
    $apk = Resolve-Apk
    Write-Host "[설치] $apk" -ForegroundColor Cyan
    # -r 재설치, -d 다운그레이드 허용(기기에 더 높은 버전이 깔려 있어도 진단용으로 덮기).
    $result = & adb install -r -d "$apk" 2>&1
    if ($LASTEXITCODE -ne 0 -or $result -match 'Failure') {
        throw "APK 설치 실패:`n$result"
    }
    Write-Host "[OK] 설치 완료" -ForegroundColor Green
}

function Invoke-Capture {
    $path = Resolve-LogFile
    Write-Host "[캡처] 로그 → $path" -ForegroundColor Cyan
    # 1) 버퍼 비우기 — 과거 로그가 섞이지 않도록.
    & adb logcat -c 2>&1 | Out-Null
    # 2) 앱 콜드 스타트.
    & adb shell am start -n "$PackageName/$MainActivity" 2>&1 | Out-Null
    Start-Sleep -Milliseconds $LaunchSettleMs
    Write-Host @"
[안내] 지금부터 폰에서 오류가 나던 동작을 그대로 재현하세요.
       오류가 재현되면 이 창에서 Ctrl+C 로 캡처를 멈추세요.
       (threadtime 포맷, 경고(W) 이상 전 프로세스 + 크래시 버퍼)
"@ -ForegroundColor Yellow
    # 3) 스트리밍 캡처. crash 버퍼 포함, 경고 이상. 프로세스 한정 안 함 —
    #    TWA 웹 오류는 Chrome 프로세스에, 네이티브 크래시는 우리 PID 에 나기 때문.
    try {
        & adb logcat -v threadtime -b main -b crash *:W | Tee-Object -FilePath $path
    } catch {
        Write-Host "`n[캡처 종료]" -ForegroundColor Yellow
    }
    Write-Host "[OK] 캡처 저장: $path" -ForegroundColor Green
    return $path
}

function Invoke-Analyze {
    param([string]$Path)
    if (-not $Path) { $Path = $LogFile }
    if (-not $Path -or -not (Test-Path $Path)) {
        # 캡처 파일 미지정 시 가장 최근 캡처 자동 선택.
        $latest = Get-ChildItem -Path $ResultsDir -Filter 'logcat-*.txt' -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if (-not $latest) { throw "분석할 로그 파일이 없습니다. 먼저 capture 를 실행하세요." }
        $Path = $latest.FullName
    }
    Write-Host "`n========== 오류 분석: $Path ==========" -ForegroundColor Cyan
    $lines = Get-Content -Path $Path -ErrorAction Stop
    Write-Host "총 $($lines.Count) 줄 캡처됨" -ForegroundColor Gray

    $pattern = ($AppTags + $CrashSignals) -join '|'
    $hits = $lines | Select-String -Pattern $pattern
    if (-not $hits) {
        Write-Host "[결과] 관련 오류 신호를 찾지 못했습니다. 재현이 됐는지, 캡처 시점이 맞는지 확인하세요." -ForegroundColor Yellow
        return
    }

    # 치명적 크래시 우선 표시 — 스택트레이스는 앞뒤 맥락이 핵심.
    $fatal = $lines | Select-String -Pattern 'FATAL EXCEPTION|AndroidRuntime|ANR in' -Context 0, 25
    if ($fatal) {
        Write-Host "`n--- [치명적 크래시 / ANR] ---" -ForegroundColor Red
        $fatal | ForEach-Object { $_.Line; $_.Context.PostContext }
    }

    Write-Host "`n--- [CrashReporter / 앱 태그 / 예외 신호 전체] ---" -ForegroundColor Magenta
    $hits | ForEach-Object { $_.Line }

    Write-Host "`n--- [요약] ---" -ForegroundColor Cyan
    $summary = $hits | ForEach-Object {
        if ($_.Line -match '\b([EWF])\s') { $matches[1] } else { '?' }
    } | Group-Object | Sort-Object Count -Descending
    $summary | ForEach-Object { Write-Host ("  {0} 레벨: {1} 건" -f $_.Name, $_.Count) }
    Write-Host "========== 분석 끝 ==========" -ForegroundColor Cyan
}

# ── 디스패치 ──────────────────────────────────────────────────────────────────
try {
    switch ($Action) {
        'install' { Assert-Device; Invoke-Install }
        'capture' { Assert-Device; Invoke-Capture | Out-Null }
        'analyze' { Invoke-Analyze -Path $LogFile }
        'all' {
            Assert-Device
            Invoke-Install
            $captured = Invoke-Capture
            Invoke-Analyze -Path $captured
        }
    }
} catch {
    Write-Host "`n[오류] $_" -ForegroundColor Red
    exit 1
}
