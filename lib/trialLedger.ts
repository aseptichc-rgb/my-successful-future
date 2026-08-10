/**
 * 트라이얼 원장 — 탈퇴 → 재가입으로 14일 무료 체험을 무한 리셋하는 것을 막는 장치.
 *
 * 계정과 분리해서 보존해야 목적을 달성할 수 있으므로(계정을 지워도 남아야 한다),
 * 원문 이메일 대신 단방향 해시를 문서 ID 로 쓴다. 해시로는 이메일을 복원할 수 없고
 * "이 해시가 전에 트라이얼을 받았는가" 만 판정 가능하다.
 *
 * 계정 삭제 시: 문서 자체는 남기되(남기지 않으면 리셋 차단이 무력화됨) 계정과 연결되는
 * lastUid 는 지운다 — [app/api/account/delete/route.ts] 참고.
 *
 * 접근: server-only. firestore.rules 에서 클라이언트 read/write 모두 차단.
 */
import { createHash } from "node:crypto";

export const TRIAL_LEDGER_COLLECTION = "trialLedger";

/** 이메일을 트라이얼 원장 문서 ID(sha256 hex)로 변환 — 원문 이메일은 저장하지 않는다. */
export function trialLedgerKey(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

/** 원장 문서 경로. 이메일이 없는 계정(익명 등)은 원장을 쓰지 않으므로 null. */
export function trialLedgerPath(email: string | null | undefined): string | null {
  if (!email) return null;
  return `${TRIAL_LEDGER_COLLECTION}/${trialLedgerKey(email)}`;
}
