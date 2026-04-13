"use client";

/**
 * 외부 푸시 토큰 받은 사람이 여는 "연결 마법사" 페이지.
 * URL 형식: /connect#token=mfp_xxx&label=프로젝트A
 *
 * 토큰은 URL fragment(#) 에 두므로 서버 액세스 로그에 남지 않고
 * 페이지 자바스크립트만 읽는다. (HTTPS 전제)
 *
 * 컴퓨터 잘 모르는 사용자도 쓸 수 있도록 3가지 옵션 제공:
 *   1) "그냥 결과 붙여넣기" — 텍스트 박스에 붙여넣고 보내기 (어떤 AI 도구든 OK)
 *   2) "Claude Code 자동 연결" — 한 줄 명령어 복사해서 터미널에 붙여넣기
 *   3) "직접 curl 보내기" — 개발자용
 */

import { useEffect, useMemo, useState } from "react";

type Tab = "paste" | "auto" | "advanced";
type OS = "mac" | "windows" | "linux" | "unknown";

function detectOS(): OS {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("win")) return "windows";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

function parseHash(): { token: string; label: string } {
  if (typeof window === "undefined") return { token: "", label: "" };
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const params = new URLSearchParams(hash);
  return {
    token: params.get("token") || "",
    label: params.get("label") || "",
  };
}

export default function ConnectPage() {
  const [token, setToken] = useState("");
  const [label, setLabel] = useState("");
  const [tab, setTab] = useState<Tab>("paste");
  const [os, setOS] = useState<OS>("unknown");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    const { token: t, label: l } = parseHash();
    setToken(t);
    setLabel(l);
    setOS(detectOS());
    setOrigin(window.location.origin);
  }, []);

  if (!token) {
    return (
      <div className="mx-auto mt-20 max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <h1 className="text-lg font-bold text-red-900">유효하지 않은 링크</h1>
        <p className="mt-2 text-sm text-red-700">
          이 페이지는 채팅방 소유자가 보내준 전용 링크로만 열 수 있어요.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">
          📥 채팅방에 결과 보내기
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          {label ? (
            <>
              <strong className="text-gray-900">{label}</strong> 채팅방으로 결과물을 보낼 수 있는
              전용 링크예요.
            </>
          ) : (
            "채팅방으로 결과물을 보낼 수 있는 전용 링크예요."
          )}
        </p>

        {/* 탭 */}
        <div className="mt-5 flex gap-1 border-b border-gray-200 text-sm">
          <TabButton active={tab === "paste"} onClick={() => setTab("paste")}>
            ✏️ 직접 붙여넣기 <span className="ml-1 text-[10px] text-blue-600">가장 쉬움</span>
          </TabButton>
          <TabButton active={tab === "auto"} onClick={() => setTab("auto")}>
            ⚡ Claude Code 자동 연결
          </TabButton>
          <TabButton active={tab === "advanced"} onClick={() => setTab("advanced")}>
            🛠 기타 도구
          </TabButton>
        </div>

        {tab === "paste" && <PasteTab token={token} />}
        {tab === "auto" && <AutoTab token={token} label={label} os={os} origin={origin} />}
        {tab === "advanced" && <AdvancedTab token={token} origin={origin} />}
      </div>

      <p className="mx-auto mt-4 max-w-md text-center text-xs text-gray-500">
        🔒 이 링크는 만료/폐기될 수 있어요. 채팅방 소유자가 권한을 거두면 더 이상 보낼 수 없어요.
      </p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2 transition-colors ${
        active
          ? "border-blue-600 text-blue-700"
          : "border-transparent text-gray-500 hover:text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────
// 1) 직접 붙여넣기 — 누구나 쓸 수 있음
// ─────────────────────────────────────────────
function PasteTab({ token }: { token: string }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [authorLabel, setAuthorLabel] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function send() {
    if (!content.trim()) {
      setResult({ ok: false, msg: "내용을 입력해주세요." });
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/external-push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Push-Token": token,
        },
        body: JSON.stringify({
          title: title.trim() || undefined,
          content,
          authorLabel: authorLabel.trim() || undefined,
          attachAsDocument: true,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ ok: false, msg: json.error || `전송 실패 (${res.status})` });
      } else {
        setResult({ ok: true, msg: "전송됐어요! 채팅방을 확인하세요." });
        setTitle("");
        setContent("");
      }
    } catch (err) {
      setResult({ ok: false, msg: err instanceof Error ? err.message : "네트워크 오류" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-5 space-y-3">
      <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-900">
        💡 <strong>가장 쉬운 방법:</strong> ChatGPT, Claude, Cursor, Gemini 등 어떤 AI를 쓰든
        결과물을 복사해서 아래에 붙여넣고 "보내기"만 누르면 채팅방에 도착해요.
      </p>
      <div>
        <label className="text-xs font-medium text-gray-700">
          내 이름 (선택)
          <input
            type="text"
            value={authorLabel}
            onChange={(e) => setAuthorLabel(e.target.value)}
            placeholder="예: 민준"
            maxLength={60}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700">
          제목 (선택)
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 시장조사 결과"
            maxLength={200}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700">
          내용 *
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="여기에 AI 결과물을 붙여넣으세요"
            rows={10}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono"
          />
        </label>
        <p className="mt-1 text-[11px] text-gray-500">
          {content.length.toLocaleString()}자 (최대 50,000자)
        </p>
      </div>
      <button
        type="button"
        onClick={send}
        disabled={sending || !content.trim()}
        className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {sending ? "보내는 중..." : "📤 채팅방에 보내기"}
      </button>
      {result && (
        <div
          className={`rounded-md px-3 py-2 text-sm ${
            result.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
          }`}
        >
          {result.ok ? "✅ " : "⚠️ "} {result.msg}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 2) Claude Code 자동 연결 — OS 별 한 줄 명령어
// ─────────────────────────────────────────────
function AutoTab({
  token,
  label,
  os,
  origin,
}: {
  token: string;
  label: string;
  os: OS;
  origin: string;
}) {
  const [copied, setCopied] = useState(false);
  const installerUrl = useMemo(
    () => `${origin}/api/install/claude-code?token=${encodeURIComponent(token)}${label ? `&label=${encodeURIComponent(label)}` : ""}`,
    [origin, token, label]
  );

  const macLinuxCmd = `curl -fsSL "${installerUrl}" | bash`;
  const windowsCmd = `irm "${installerUrl}&os=ps" | iex`;

  const cmd = os === "windows" ? windowsCmd : macLinuxCmd;

  function copyCmd() {
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mt-5 space-y-4">
      <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
        ⚡ 한 번만 설정해두면 Claude Code가 응답을 끝낼 때마다 결과가 자동으로 채팅방에 올라가요.
      </p>

      <div>
        <h3 className="text-sm font-semibold text-gray-900">
          1단계. 터미널 열기
        </h3>
        <p className="mt-1 text-xs text-gray-600">
          {os === "mac" && "⌘ + 스페이스 → \"터미널\" 입력 → 엔터"}
          {os === "windows" && "윈도우 시작 → \"PowerShell\" 검색 → 클릭"}
          {os === "linux" && "Ctrl + Alt + T 누르거나 앱에서 \"터미널\" 실행"}
          {os === "unknown" && "Mac: ⌘+스페이스 → 터미널 / Windows: 시작 → PowerShell / Linux: Ctrl+Alt+T"}
        </p>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-900">
          2단계. 아래 명령어를 복사해서 터미널에 붙여넣고 엔터
        </h3>
        <div className="mt-2 overflow-x-auto rounded-lg bg-gray-900 p-3">
          <code className="block whitespace-pre-wrap break-all text-[12px] font-mono text-green-200">
            {cmd}
          </code>
        </div>
        <button
          type="button"
          onClick={copyCmd}
          className="mt-2 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          {copied ? "✓ 복사됨" : "📋 명령어 복사"}
        </button>
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-gray-500">
            다른 운영체제 명령어 보기
          </summary>
          <div className="mt-2 space-y-2 text-[11px]">
            <div>
              <p className="font-semibold text-gray-700">Mac / Linux:</p>
              <code className="block break-all rounded bg-gray-100 p-2 font-mono">{macLinuxCmd}</code>
            </div>
            <div>
              <p className="font-semibold text-gray-700">Windows (PowerShell):</p>
              <code className="block break-all rounded bg-gray-100 p-2 font-mono">{windowsCmd}</code>
            </div>
          </div>
        </details>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-900">
          3단계. 끝!
        </h3>
        <p className="mt-1 text-xs text-gray-600">
          연결되면 채팅방에 <strong>"연결 완료"</strong> 메시지가 자동으로 도착해요.
          이제 Claude Code로 작업할 때마다 응답 결과가 채팅방에 자동으로 올라갑니다.
        </p>
      </div>

      <details className="rounded-md border border-gray-200 p-2">
        <summary className="cursor-pointer text-xs text-gray-700">
          🔍 이 명령어가 뭘 하는지 보기
        </summary>
        <ul className="mt-2 space-y-1 pl-4 text-[11px] text-gray-600">
          <li>• <code>~/.claude/scripts/push-to-chat.sh</code> 라는 헬퍼 스크립트를 만들어요.</li>
          <li>• <code>~/.claude/settings.json</code> 의 <code>Stop</code> 후크에 이 채팅방으로 보내는 줄을 추가해요.</li>
          <li>• 기존 설정은 백업되며 다른 후크는 건드리지 않아요.</li>
          <li>• 마지막에 "연결 완료" 핑을 한 번 보내서 잘 됐는지 확인해줘요.</li>
        </ul>
      </details>

      <details className="rounded-md border border-gray-200 p-2">
        <summary className="cursor-pointer text-xs text-gray-700">
          ❌ 자동 연결 해제하는 법
        </summary>
        <p className="mt-2 pl-4 text-[11px] text-gray-600">
          채팅방 소유자가 토큰을 폐기하면 자동으로 차단돼요. 후크 자체를 지우려면
          <code> ~/.claude/settings.json</code> 파일에서 <code>{"// claude-code-push: <라벨>"}</code> 주석이
          붙은 줄을 삭제하세요.
        </p>
      </details>
    </div>
  );
}

// ─────────────────────────────────────────────
// 3) 기타 도구 — curl / 다른 AI 에이전트 hook
// ─────────────────────────────────────────────
function AdvancedTab({ token, origin }: { token: string; origin: string }) {
  const curl = `curl -X POST "${origin}/api/external-push" \\
  -H "X-Push-Token: ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "결과 제목",
    "content": "본문 (마크다운 지원)",
    "attachAsDocument": true,
    "authorLabel": "보내는 사람 이름"
  }'`;

  return (
    <div className="mt-5 space-y-3 text-sm text-gray-700">
      <p className="rounded-md bg-gray-50 px-3 py-2 text-xs">
        🛠 다른 AI 에이전트(Cursor, Aider 등)나 자체 스크립트에서 직접 호출할 때 쓰세요.
        엔드포인트는 <code className="bg-gray-200 px-1">POST /api/external-push</code>,
        토큰은 <code className="bg-gray-200 px-1">X-Push-Token</code> 헤더에 넣으면 됩니다.
      </p>
      <div>
        <h3 className="font-semibold">curl 한 번 보내기</h3>
        <pre className="mt-1 overflow-x-auto rounded-md bg-gray-900 p-3 text-[11px] text-green-200">
{curl}
        </pre>
      </div>
      <div>
        <h3 className="font-semibold">필드</h3>
        <ul className="mt-1 list-disc pl-5 text-xs">
          <li><code>content</code> (필수) — 본문 텍스트, 최대 50,000자</li>
          <li><code>title</code> — 메시지 제목 (선택)</li>
          <li><code>summary</code> — 메시지에 보일 짧은 요약 (선택, 길면 본문은 첨부문서로 등록)</li>
          <li><code>authorLabel</code> — 보내는 사람 이름</li>
          <li><code>attachAsDocument</code> — true (기본) 면 AI 컨텍스트에도 자동 등록</li>
        </ul>
      </div>
    </div>
  );
}
