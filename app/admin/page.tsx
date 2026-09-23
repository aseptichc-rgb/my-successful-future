"use client";

/**
 * 어드민 대시보드 — /admin
 *
 * 보여주는 정보:
 * - 가입자 수 (총·7일·30일)
 * - 토큰 사용량 / 비용 (총·7일·30일)
 * - 모델별 사용 분포
 * - 상위 사용자 (비용 기준)
 *
 * 권한: 서버 측에서 ADMIN_EMAILS 환경변수로 검증.
 *       비어 있으면 항상 403 — 즉, 환경변수 미설정 시 어드민 페이지는 작동하지 않는다.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { authedFetch } from "@/lib/authedFetch";

interface ModelBucket {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  calls: number;
}

interface UserBucket {
  uid: string;
  email?: string;
  displayName?: string;
  totalTokens: number;
  costUsd: number;
  calls: number;
}

interface UsageWindow {
  tokens: number;
  costUsd: number;
  calls: number;
}

interface EventWindow {
  count: number;
  users: number;
}

interface EventCountRow {
  name: string;
  last7d: EventWindow;
  last30d: EventWindow;
}

interface RetentionBucket {
  eligible: number;
  returned: number;
  rate: number | null;
}

interface FeedbackRow {
  id: string;
  text: string;
  contactOk: boolean;
  email: string | null;
  locale: string | null;
  platform: string | null;
  createdAt: string | null;
}

interface StatsResponse {
  ok: true;
  generatedAt: string;
  users: { total: number; signups7d: number; signups30d: number };
  entitlementRequired: boolean;
  events: EventCountRow[];
  retention: { d1: RetentionBucket; d7: RetentionBucket };
  recentFeedback: FeedbackRow[];
  usage: { total: UsageWindow; last7d: UsageWindow; last30d: UsageWindow };
  byModel: ModelBucket[];
  topUsers: UserBucket[];
}

const fmtNum = (n: number) => n.toLocaleString("ko-KR");
const fmtRate = (b: RetentionBucket) =>
  b.rate === null ? "—" : `${Math.round(b.rate * 100)}%`;
const fmtRateSub = (b: RetentionBucket) => `${fmtNum(b.returned)} / ${fmtNum(b.eligible)}명`;
const fmtUsd = (n: number) =>
  n < 0.01 ? `$${n.toFixed(6)}` : `$${n.toFixed(2)}`;

export default function AdminPage() {
  const router = useRouter();
  const { firebaseUser, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await authedFetch("/api/admin/stats");
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            (data as { error?: string }).error || `요청 실패 (${res.status})`
          );
        }
        if (!cancelled) setStats(data as StatsResponse);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, firebaseUser, router]);

  if (authLoading || loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#F0EDE6]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-black/10 border-t-[#1E1B4B]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#F0EDE6] px-6 text-center">
        <h1 className="text-xl font-semibold text-[#1E1B4B]">어드민 페이지</h1>
        <p className="max-w-md text-sm text-red-700">{error}</p>
        <p className="max-w-md text-xs text-black/60">
          접근 권한이 없습니다.
        </p>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="min-h-full bg-[#F0EDE6] px-5 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.005em] text-[#1E1B4B] sm:text-[32px]">
            어드민 대시보드
          </h1>
          <p className="text-[13px] text-black/60">
            생성 시각: {new Date(stats.generatedAt).toLocaleString("ko-KR")}
          </p>
          <p
            className={`mt-1 inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium ${
              stats.entitlementRequired
                ? "bg-emerald-100 text-emerald-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            결제 게이트 (ENTITLEMENT_REQUIRED):{" "}
            {stats.entitlementRequired ? "켜짐 — 체험 만료자에게 402·페이월 동작" : "꺼짐 — 아무도 페이월을 보지 않음"}
          </p>
        </header>

        {/* 가입자 */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="총 가입자" value={fmtNum(stats.users.total)} />
          <StatCard label="최근 7일 가입" value={fmtNum(stats.users.signups7d)} />
          <StatCard label="최근 30일 가입" value={fmtNum(stats.users.signups30d)} />
        </section>

        {/* 리텐션 — 최근 30일 가입자 기준, D1 = 다음 날 복귀, D7 = 7~13일째 복귀(lib/retention) */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatCard
            label="D1 리텐션"
            value={fmtRate(stats.retention.d1)}
            subtitle={`${fmtRateSub(stats.retention.d1)} · 가입 다음 날 앱 열기`}
          />
          <StatCard
            label="D7 리텐션"
            value={fmtRate(stats.retention.d7)}
            subtitle={`${fmtRateSub(stats.retention.d7)} · 7~13일째 한 번이라도`}
          />
        </section>

        {/* 퍼널 이벤트 */}
        <section className="rounded-xl border border-black/[0.06] bg-white p-5">
          <h2 className="mb-1 text-[16px] font-semibold text-[#1E1B4B]">퍼널 이벤트</h2>
          <p className="mb-3 text-[12px] text-black/50">
            건수 / 고유 사용자. trial_started → onboarding_completed → app_open → paywall_viewed →
            purchase_started → purchase_completed
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[13px]">
              <thead className="text-black/60">
                <tr className="border-b border-black/[0.06]">
                  <th className="py-2 pr-3 font-medium">이벤트</th>
                  <th className="py-2 pr-3 font-medium">최근 7일</th>
                  <th className="py-2 pr-3 font-medium">최근 30일</th>
                </tr>
              </thead>
              <tbody>
                {stats.events.map((e) => (
                  <tr key={e.name} className="border-b border-black/[0.04]">
                    <td className="py-2 pr-3 font-medium text-[#1E1B4B]">{e.name}</td>
                    <td className="py-2 pr-3">
                      {fmtNum(e.last7d.count)}
                      <span className="ml-1 text-black/50">/ {fmtNum(e.last7d.users)}명</span>
                    </td>
                    <td className="py-2 pr-3">
                      {fmtNum(e.last30d.count)}
                      <span className="ml-1 text-black/50">/ {fmtNum(e.last30d.users)}명</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 최근 피드백 */}
        <section className="rounded-xl border border-black/[0.06] bg-white p-5">
          <h2 className="mb-3 text-[16px] font-semibold text-[#1E1B4B]">최근 피드백</h2>
          {stats.recentFeedback.length === 0 ? (
            <p className="text-sm text-black/60">아직 받은 피드백이 없습니다.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {stats.recentFeedback.map((f) => (
                <li key={f.id} className="rounded-lg bg-[#F7F5F0] px-4 py-3">
                  <p className="whitespace-pre-wrap text-[14px] leading-[20px] text-[#1E1B4B]">
                    {f.text}
                  </p>
                  <p className="mt-1.5 text-[11px] text-black/50">
                    {f.createdAt ? new Date(f.createdAt).toLocaleString("ko-KR") : "—"}
                    {" · "}
                    {f.platform ?? "?"} · {f.locale ?? "?"}
                    {f.contactOk && f.email ? ` · 답장 OK: ${f.email}` : " · 답장 원치 않음"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 사용량 / 비용 */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            label="총 토큰"
            value={fmtNum(stats.usage.total.tokens)}
            subtitle={`${fmtNum(stats.usage.total.calls)}회 호출 · ${fmtUsd(stats.usage.total.costUsd)}`}
          />
          <StatCard
            label="최근 7일 토큰"
            value={fmtNum(stats.usage.last7d.tokens)}
            subtitle={`${fmtNum(stats.usage.last7d.calls)}회 · ${fmtUsd(stats.usage.last7d.costUsd)}`}
          />
          <StatCard
            label="최근 30일 토큰"
            value={fmtNum(stats.usage.last30d.tokens)}
            subtitle={`${fmtNum(stats.usage.last30d.calls)}회 · ${fmtUsd(stats.usage.last30d.costUsd)}`}
          />
        </section>

        {/* 모델별 */}
        <section className="rounded-xl border border-black/[0.06] bg-white p-5">
          <h2 className="mb-3 text-[16px] font-semibold text-[#1E1B4B]">모델별 사용량</h2>
          {stats.byModel.length === 0 ? (
            <p className="text-sm text-black/60">아직 기록된 사용량이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className="text-black/60">
                  <tr className="border-b border-black/[0.06]">
                    <th className="py-2 pr-3 font-medium">모델</th>
                    <th className="py-2 pr-3 font-medium">호출</th>
                    <th className="py-2 pr-3 font-medium">입력</th>
                    <th className="py-2 pr-3 font-medium">출력</th>
                    <th className="py-2 pr-3 font-medium">합계</th>
                    <th className="py-2 pr-3 font-medium">비용</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byModel.map((m) => (
                    <tr key={`${m.provider}|${m.model}`} className="border-b border-black/[0.04]">
                      <td className="py-2 pr-3 text-[#1E1B4B]">
                        <span className="font-medium">{m.model}</span>
                        <span className="ml-2 text-[11px] text-black/50">{m.provider}</span>
                      </td>
                      <td className="py-2 pr-3">{fmtNum(m.calls)}</td>
                      <td className="py-2 pr-3">{fmtNum(m.promptTokens)}</td>
                      <td className="py-2 pr-3">{fmtNum(m.completionTokens)}</td>
                      <td className="py-2 pr-3">{fmtNum(m.totalTokens)}</td>
                      <td className="py-2 pr-3">{fmtUsd(m.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 사용자 상위 */}
        <section className="rounded-xl border border-black/[0.06] bg-white p-5">
          <h2 className="mb-3 text-[16px] font-semibold text-[#1E1B4B]">
            상위 사용자 (비용 기준)
          </h2>
          {stats.topUsers.length === 0 ? (
            <p className="text-sm text-black/60">아직 사용자별 기록이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-[13px]">
                <thead className="text-black/60">
                  <tr className="border-b border-black/[0.06]">
                    <th className="py-2 pr-3 font-medium">사용자</th>
                    <th className="py-2 pr-3 font-medium">호출</th>
                    <th className="py-2 pr-3 font-medium">토큰</th>
                    <th className="py-2 pr-3 font-medium">비용</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.topUsers.map((u) => (
                    <tr key={u.uid} className="border-b border-black/[0.04]">
                      <td className="py-2 pr-3 text-[#1E1B4B]">
                        <div className="font-medium">{u.displayName || u.email || u.uid}</div>
                        {u.email && u.displayName && (
                          <div className="text-[11px] text-black/50">{u.email}</div>
                        )}
                      </td>
                      <td className="py-2 pr-3">{fmtNum(u.calls)}</td>
                      <td className="py-2 pr-3">{fmtNum(u.totalTokens)}</td>
                      <td className="py-2 pr-3">{fmtUsd(u.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white p-5">
      <div className="text-[12px] font-medium uppercase tracking-wide text-black/50">
        {label}
      </div>
      <div className="mt-2 text-[24px] font-semibold leading-tight text-[#1E1B4B]">
        {value}
      </div>
      {subtitle && <div className="mt-1 text-[12px] text-black/60">{subtitle}</div>}
    </div>
  );
}
