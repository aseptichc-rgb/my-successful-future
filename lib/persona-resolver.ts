import type {
  Persona,
  PersonaId,
  BuiltinPersonaId,
  PersonaOverride,
  CustomPersona,
} from "@/types";
import { PERSONAS, isBuiltinPersona } from "./personas";

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

// resolvePersonaServer 는 lib/persona-resolver-server.ts 로 분리 (firebase-admin 의존)
