/**
 * Claude Code 자동 연결 설치 스크립트 생성기.
 *
 * 사용:
 *   curl -fsSL "https://domain/api/install/claude-code?token=mfp_..." | bash
 *   irm "https://domain/api/install/claude-code?token=mfp_...&os=ps" | iex   (Windows PowerShell)
 *
 * 동작:
 *   1) ~/.claude/scripts/push-to-chat.sh (또는 .ps1) 헬퍼 작성
 *   2) ~/.claude/settings.json 백업 후 Stop hook 머지 (jq 또는 PS의 ConvertFrom-Json 사용)
 *   3) 채팅방에 "연결 완료" 핑 발송
 *
 * 보안:
 *   - 토큰 자체는 응답 본문에 포함되며 사용자가 직접 다운로드 해 실행하므로 가시화됨
 *   - 토큰의 권한 통제는 채팅방 소유자(폐기/만료) 책임
 *   - 토큰 검증 자체는 하지 않음 (잘못된 토큰이면 ping 단계에서 실패함을 사용자가 봄)
 *   - X-Content-Type-Options: nosniff 으로 MIME 스니핑 차단
 */

import { NextRequest, NextResponse } from "next/server";
import { looksLikeToken } from "@/lib/pushTokens";

export const runtime = "nodejs";

/** 셸/JSON 안전: 작은따옴표만 escape (작은따옴표 안에 들어갈 값). */
function shellEscape(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** PowerShell 안전 escape: 작은따옴표 안에 넣을 값 ('은 ''로 더블링). */
function psEscape(s: string): string {
  return `'${s.replace(/'/g, `''`)}'`;
}

function buildBashInstaller(token: string, label: string, origin: string): string {
  const safeToken = shellEscape(token);
  const safeLabel = shellEscape(label || "외부 작업물");
  const safeOrigin = shellEscape(origin);

  return `#!/usr/bin/env bash
# Claude Code → 채팅방 자동 연결 설치
# 안전을 위해 strict 모드
set -euo pipefail

TOKEN=${safeToken}
LABEL=${safeLabel}
ORIGIN=${safeOrigin}
PUSH_URL="\${ORIGIN}/api/external-push"

CLAUDE_DIR="\${HOME}/.claude"
SCRIPTS_DIR="\${CLAUDE_DIR}/scripts"
SETTINGS="\${CLAUDE_DIR}/settings.json"
HELPER="\${SCRIPTS_DIR}/push-to-chat.sh"

mkdir -p "\${SCRIPTS_DIR}"

# ── 의존성 확인 ─────────────────────────────────────
if ! command -v jq >/dev/null 2>&1; then
  echo "❌ jq 명령어가 필요해요. (Mac: 'brew install jq', Linux: 'apt install jq' 또는 'yum install jq')"
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "❌ curl 명령어가 필요해요."
  exit 1
fi

# ── 헬퍼 스크립트 작성 ──────────────────────────────
cat > "\${HELPER}" <<'HELPER_EOF'
#!/usr/bin/env bash
# Claude Code Stop hook: transcript 마지막 응답을 채팅방에 푸시
set -euo pipefail

PUSH_TOKEN="__TOKEN__"
PUSH_LABEL="__LABEL__"
PUSH_URL="__URL__"

# Stop hook은 stdin 으로 JSON 받음: { session_id, transcript_path, ... }
INPUT="$(cat)"
TRANSCRIPT="$(printf '%s' "$INPUT" | jq -r '.transcript_path // empty')"
[[ -z "\${TRANSCRIPT}" || ! -f "\${TRANSCRIPT}" ]] && exit 0

# transcript 마지막 assistant 메시지 추출 (jsonl 형식 가정)
LAST_ASSISTANT="$(tac "\${TRANSCRIPT}" 2>/dev/null | jq -r 'select(.role=="assistant") | .content // (.message.content // "")' 2>/dev/null | head -n 1 || true)"
[[ -z "\${LAST_ASSISTANT}" ]] && exit 0

# JSON payload 생성 (jq 가 안전하게 escape)
PAYLOAD="$(jq -nc \\
  --arg title "Claude Code 응답" \\
  --arg content "\${LAST_ASSISTANT}" \\
  --arg authorLabel "\${PUSH_LABEL}" \\
  '{title:$title, content:$content, authorLabel:$authorLabel, attachAsDocument:true}')"

# 백그라운드로 전송 (Claude Code 흐름 막지 않기)
curl -fsS -X POST "\${PUSH_URL}" \\
  -H "X-Push-Token: \${PUSH_TOKEN}" \\
  -H "Content-Type: application/json" \\
  --max-time 10 \\
  -d "\${PAYLOAD}" >/dev/null 2>&1 || true

exit 0
HELPER_EOF

# 토큰/라벨/URL 치환 (sed 대신 안전한 awk 사용 — 메타문자 영향 없음)
TMP="\${HELPER}.tmp"
awk -v tok="\${TOKEN}" -v lab="\${LABEL}" -v url="\${PUSH_URL}" '{
  gsub(/__TOKEN__/, tok);
  gsub(/__LABEL__/, lab);
  gsub(/__URL__/, url);
  print
}' "\${HELPER}" > "\${TMP}" && mv "\${TMP}" "\${HELPER}"
chmod +x "\${HELPER}"

# ── settings.json 머지 ──────────────────────────────
if [[ -f "\${SETTINGS}" ]]; then
  cp "\${SETTINGS}" "\${SETTINGS}.bak.\$(date +%Y%m%d%H%M%S)"
  CURRENT="\$(cat "\${SETTINGS}")"
else
  CURRENT='{}'
fi

NEW="\$(printf '%s' "\${CURRENT}" | jq \\
  --arg cmd "\${HELPER}" \\
  --arg lab "\${LABEL}" '
  .hooks //= {} |
  .hooks.Stop //= [] |
  # 같은 라벨의 이전 hook 제거 (재설치 시 중복 방지)
  .hooks.Stop |= map(select((.hooks // []) | all(.command // "" | contains($cmd) | not))) |
  .hooks.Stop += [{
    "matcher": "*",
    "hooks": [{
      "type": "command",
      "command": $cmd,
      "_label": ("claude-code-push: " + $lab)
    }]
  }]
')"

printf '%s\\n' "\${NEW}" > "\${SETTINGS}"

# ── 연결 확인 핑 ──────────────────────────────────
PING="$(jq -nc \\
  --arg label "\${LABEL}" \\
  '{title:"✅ 연결 완료", content:("이제 Claude Code 응답이 자동으로 채팅방에 올라가요. (라벨: " + $label + ")"), authorLabel:$label, attachAsDocument:false}')"

if curl -fsS -X POST "\${PUSH_URL}" \\
  -H "X-Push-Token: \${TOKEN}" \\
  -H "Content-Type: application/json" \\
  --max-time 10 \\
  -d "\${PING}" >/dev/null 2>&1; then
  echo "✅ 설치 완료! 채팅방을 확인하세요."
  echo "   - 헬퍼: \${HELPER}"
  echo "   - 설정: \${SETTINGS} (백업 보관됨)"
else
  echo "⚠️  설치는 됐지만 채팅방 핑 발송에 실패했어요."
  echo "   토큰이 만료되었거나 폐기된 상태일 수 있습니다. 채팅방 소유자에게 새 링크를 요청하세요."
  exit 2
fi
`;
}

function buildPowerShellInstaller(token: string, label: string, origin: string): string {
  const safeToken = psEscape(token);
  const safeLabel = psEscape(label || "외부 작업물");
  const safeOrigin = psEscape(origin);

  return `# Claude Code -> 채팅방 자동 연결 (Windows PowerShell)
$ErrorActionPreference = 'Stop'

$Token = ${safeToken}
$Label = ${safeLabel}
$Origin = ${safeOrigin}
$PushUrl = "$Origin/api/external-push"

$ClaudeDir = Join-Path $HOME '.claude'
$ScriptsDir = Join-Path $ClaudeDir 'scripts'
$Settings = Join-Path $ClaudeDir 'settings.json'
$Helper = Join-Path $ScriptsDir 'push-to-chat.ps1'

New-Item -ItemType Directory -Force -Path $ScriptsDir | Out-Null

# 헬퍼 스크립트 작성
$HelperBody = @"
# Claude Code Stop hook: transcript 마지막 응답을 채팅방에 푸시
\$ErrorActionPreference = 'SilentlyContinue'
\$Input = [Console]::In.ReadToEnd()
try {
  \$ev = \$Input | ConvertFrom-Json
  \$transcript = \$ev.transcript_path
  if (-not \$transcript -or -not (Test-Path \$transcript)) { exit 0 }
  \$lines = Get-Content \$transcript
  \$lastAssistant = $null
  for (\$i = \$lines.Length - 1; \$i -ge 0; \$i--) {
    try {
      \$obj = \$lines[\$i] | ConvertFrom-Json
      if (\$obj.role -eq 'assistant') {
        \$lastAssistant = if (\$obj.content) { \$obj.content } elseif (\$obj.message.content) { \$obj.message.content } else { '' }
        break
      }
    } catch {}
  }
  if (-not \$lastAssistant) { exit 0 }
  \$payload = @{
    title = 'Claude Code 응답'
    content = [string]\$lastAssistant
    authorLabel = '__LABEL__'
    attachAsDocument = $true
  } | ConvertTo-Json -Compress
  Invoke-RestMethod -Uri '__URL__' -Method Post -Headers @{ 'X-Push-Token' = '__TOKEN__'; 'Content-Type' = 'application/json' } -Body \$payload -TimeoutSec 10 | Out-Null
} catch {}
exit 0
"@
$HelperBody = $HelperBody -replace '__TOKEN__', $Token -replace '__LABEL__', $Label -replace '__URL__', $PushUrl
Set-Content -Path $Helper -Value $HelperBody -Encoding UTF8

# settings.json 머지
if (Test-Path $Settings) {
  Copy-Item $Settings "$Settings.bak.$((Get-Date).ToString('yyyyMMddHHmmss'))"
  $cfg = Get-Content $Settings -Raw | ConvertFrom-Json
} else {
  $cfg = [pscustomobject]@{}
}
if (-not $cfg.PSObject.Properties['hooks']) { $cfg | Add-Member hooks ([pscustomobject]@{}) }
if (-not $cfg.hooks.PSObject.Properties['Stop']) { $cfg.hooks | Add-Member Stop @() }

# 같은 헬퍼 경로의 기존 hook 제거 후 추가
$cfg.hooks.Stop = @($cfg.hooks.Stop | Where-Object {
  $found = $false
  foreach ($h in $_.hooks) { if ($h.command -like "*push-to-chat.ps1*") { $found = $true } }
  -not $found
})
$newHook = [pscustomobject]@{
  matcher = '*'
  hooks = @([pscustomobject]@{
    type = 'command'
    command = "powershell -NoProfile -ExecutionPolicy Bypass -File \`"$Helper\`""
    _label = "claude-code-push: $Label"
  })
}
$cfg.hooks.Stop = @($cfg.hooks.Stop) + $newHook

$cfg | ConvertTo-Json -Depth 12 | Set-Content $Settings -Encoding UTF8

# 연결 핑
$ping = @{
  title = '✅ 연결 완료'
  content = "이제 Claude Code 응답이 자동으로 채팅방에 올라가요. (라벨: $Label)"
  authorLabel = $Label
  attachAsDocument = $false
} | ConvertTo-Json -Compress

try {
  Invoke-RestMethod -Uri $PushUrl -Method Post -Headers @{ 'X-Push-Token' = $Token; 'Content-Type' = 'application/json' } -Body $ping -TimeoutSec 10 | Out-Null
  Write-Host "✅ 설치 완료! 채팅방을 확인하세요." -ForegroundColor Green
  Write-Host "   - 헬퍼: $Helper"
  Write-Host "   - 설정: $Settings (백업 보관됨)"
} catch {
  Write-Host "⚠️  설치는 됐지만 채팅방 핑 발송에 실패했어요. 토큰이 만료/폐기 상태일 수 있어요." -ForegroundColor Yellow
  exit 2
}
`;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || "";
  const label = (request.nextUrl.searchParams.get("label") || "").slice(0, 60);
  const osParam = (request.nextUrl.searchParams.get("os") || "").toLowerCase();
  const origin = request.nextUrl.origin;

  if (!looksLikeToken(token)) {
    return new NextResponse("# 유효하지 않은 토큰입니다.\nexit 1\n", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const isPS = osParam === "ps" || osParam === "windows" || osParam === "powershell";
  const body = isPS
    ? buildPowerShellInstaller(token, label, origin)
    : buildBashInstaller(token, label, origin);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": isPS
        ? "text/plain; charset=utf-8"
        : "text/x-shellscript; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
