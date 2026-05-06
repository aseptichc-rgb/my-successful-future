/**
 * 일별 호출 한도(쿼터) enforcement.
 *
 * 흐름:
 *   1) 라우트가 `enforceQuota(uid, "widgetRefresh")` 를 호출
 *   2) Firestore 트랜잭션으로 `users/{uid}/usage/{ymd}` 문서의 카운터를 읽고
 *      한도 초과면 QuotaExceededError 를 throw, 아니면 카운터를 증가시키고 통과.
 *   3) 라우트는 try/catch 로 잡아서 429 응답 또는 그레이스풀 폴백.
 *
 * Firestore 락 충돌 (동일 사용자가 동시에 두 번 호출) 은 트랜잭션이 직렬화하므로 안전.
 * 단, 하루 호출 수가 많은 라우트는 트랜잭션 비용이 누적될 수 있어 호출량이 많은 라우트는
 * weight 를 키우거나(예: 12회 호출 = 1카운트) 캐시 폴백을 함께 둔다.
 */
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { DAILY_QUOTA, type QuotaKey } from "@/lib/constants/quota";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function todayKstYmd(date: Date = new Date()): string {
  const k = new Date(date.getTime() + KST_OFFSET_MS);
  return k.toISOString().slice(0, 10);
}

export class QuotaExceededError extends Error {
  constructor(
    public readonly key: QuotaKey,
    public readonly limit: number,
    public readonly current: number,
  ) {
    super(`일별 호출 한도(${key} ${limit}회)를 초과했습니다. (현재 ${current}회)`);
    this.name = "QuotaExceededError";
  }
}

/**
 * 한도 체크 + 카운터 증가.
 * weight 는 한 호출이 차지하는 카운트 (기본 1). 스트리밍·다단계 호출에서 가중치 부여 가능.
 *
 * QuotaKey 의 한도가 0 이하면 enforce 를 비활성화한 것으로 간주하고 통과시킨다.
 */
export async function enforceQuota(
  uid: string,
  key: QuotaKey,
  weight = 1,
): Promise<{ used: number; limit: number; ymd: string }> {
  const limit = DAILY_QUOTA[key];
  if (limit <= 0) {
    return { used: 0, limit: 0, ymd: todayKstYmd() };
  }

  const db = getAdminDb();
  const ymd = todayKstYmd();
  const ref = db.doc(`users/${uid}/usage/${ymd}`);

  return await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? Number(snap.get(key)) || 0 : 0;
    const next = current + weight;

    if (next > limit) {
      throw new QuotaExceededError(key, limit, current);
    }

    if (snap.exists) {
      tx.update(ref, {
        [key]: FieldValue.increment(weight),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      tx.set(ref, {
        ymd,
        [key]: weight,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    return { used: next, limit, ymd };
  });
}

/**
 * 한도 검사만 하고 증가시키지는 않는 read-only 헬퍼.
 * 캐시 히트로 LLM 을 부르지 않는 경로에서 "조회만 가능한지" 확인할 때.
 */
export async function getQuotaUsage(uid: string, key: QuotaKey): Promise<{
  used: number;
  limit: number;
  ymd: string;
}> {
  const limit = DAILY_QUOTA[key];
  const db = getAdminDb();
  const ymd = todayKstYmd();
  const snap = await db.doc(`users/${uid}/usage/${ymd}`).get();
  const used = snap.exists ? Number(snap.get(key)) || 0 : 0;
  return { used, limit, ymd };
}
