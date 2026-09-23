/**
 * 제품 이벤트 기록 — `events` 컬렉션에 1건씩 남긴다 (server-only, tokenUsage 와 같은 규약).
 *
 * - 절대 throw 하지 않는다. 계측 실패가 결제 검증·체험 발급 같은 본 응답을 끊어선 안 된다.
 * - 개인정보: uid 와 화이트리스트 이름, 짧은 props 만 저장한다. 이메일·본문 텍스트는 싣지 않는다.
 *   props 는 [sanitizeEventProps] 가 키 수·문자열 길이를 자르고 객체/배열을 버린다.
 * - `day` 는 KST YYYY-MM-DD — D1/D7 리텐션(lib/retention) 이 "같은 날" 판정에 쓴다.
 *   createdAt 은 serverTimestamp 라 서버 시각, day 는 기록 시점의 KST 달력일이다.
 *
 * 읽기는 /api/admin/stats 가 createdAt 단일 필드 범위 조회로만 한다 — 이름별 복합 인덱스를
 * 만들지 않으려고 이름 필터는 메모리에서 건다(수백 명 규모에서 충분).
 */
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { todayKstYmd } from "@/lib/kstDate";
import {
  EVENT_PROPS_MAX_KEYS,
  EVENT_PROPS_MAX_STRING,
  type EventName,
  type EventPlatform,
} from "@/lib/constants/events";

export type EventPropValue = string | number | boolean;
export type EventProps = Record<string, EventPropValue>;

/**
 * 클라이언트/호출부가 준 props 를 저장 가능한 형태로 정리한다(순수).
 * - 문자열·유한 숫자·불리언만 남기고 나머지(객체·배열·null·NaN)는 버린다.
 * - 키는 최대 EVENT_PROPS_MAX_KEYS 개, 문자열은 EVENT_PROPS_MAX_STRING 자로 자른다.
 */
export function sanitizeEventProps(input: unknown): EventProps {
  const out: EventProps = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (Object.keys(out).length >= EVENT_PROPS_MAX_KEYS) break;
    if (!key || key.length > 40) continue;
    if (typeof value === "string") {
      out[key] = value.slice(0, EVENT_PROPS_MAX_STRING);
    } else if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = value;
    } else if (typeof value === "boolean") {
      out[key] = value;
    }
  }
  return out;
}

export interface LogEventInput {
  uid: string;
  name: EventName;
  props?: unknown;
  platform?: EventPlatform | null;
}

/** 이벤트 1건 기록. 실패는 경고 로그로만 남기고 삼킨다. */
export async function logEvent(input: LogEventInput): Promise<void> {
  try {
    await getAdminDb().collection("events").add({
      uid: input.uid,
      name: input.name,
      props: sanitizeEventProps(input.props),
      platform: input.platform ?? null,
      day: todayKstYmd(),
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.warn("[events] 기록 실패:", err instanceof Error ? err.message : String(err));
  }
}
