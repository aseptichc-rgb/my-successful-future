import type {
  Persona,
  PersonaId,
  BuiltinPersonaId,
  PersonaOverride,
  CustomPersona,
} from "@/types";
import { PERSONAS, isBuiltinPersona } from "./personas";
import { getAdminDb } from "./firebase-admin";

/**
 * 빌트인 페르소나 + 사용자 오버라이드 → 최종 Persona 객체.
 * 오버라이드가 null/undefined이거나 특정 필드가 비어있으면 기본값 유지.
 */
export function mergePersona(base: Persona, ov: PersonaOverride | null | undefined): Persona {
  if (!ov) return base;
  return {
    id: base.id,
    name: ov.name?.trim() || base.name,
    icon: ov.icon?.trim() || base.icon,
    description: ov.description?.trim() || base.description,
    systemPromptAddition: ov.systemPromptAddition?.trim() || base.systemPromptAddition,
  };
}

/**
 * 클라이언트용 순수 리졸버. 호출자가 미리 로드한 맵을 넘긴다.
 */
export function resolvePersona(
  id: PersonaId,
  customMap: Record<string, CustomPersona> | undefined,
  overrideMap: Record<string, PersonaOverride> | undefined
): Persona {
  if (isBuiltinPersona(id as string)) {
    const base = PERSONAS[id as BuiltinPersonaId];
    return mergePersona(base, overrideMap?.[id as string]);
  }
  if (customMap && customMap[id as string]) {
    const c = customMap[id as string];
    return {
      id: c.id,
      name: c.name,
      icon: c.icon,
      description: c.description,
      systemPromptAddition: c.systemPromptAddition,
    };
  }
  return PERSONAS.default;
}

/**
 * 서버(API 라우트/크론)용 리졸버. admin SDK로 Firestore 읽음.
 * uid가 없으면 기본값 그대로 반환.
 */
export async function resolvePersonaServer(
  uid: string | undefined,
  id: PersonaId
): Promise<Persona> {
  if (!isBuiltinPersona(id as string)) {
    // 커스텀 페르소나는 호출자가 별도 경로로 처리 — 기본값 폴백
    return PERSONAS.default;
  }
  const base = PERSONAS[id as BuiltinPersonaId];
  if (!uid) return base;
  try {
    const db = getAdminDb();
    const snap = await db
      .collection("users")
      .doc(uid)
      .collection("personaOverrides")
      .doc(id as string)
      .get();
    if (!snap.exists) return base;
    const ov = snap.data() as PersonaOverride;
    return mergePersona(base, ov);
  } catch (error) {
    console.warn("resolvePersonaServer 실패, 기본값 폴백:", error);
    return base;
  }
}
