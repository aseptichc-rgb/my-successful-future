import type { Persona, PersonaId, BuiltinPersonaId, PersonaOverride } from "@/types";
import { PERSONAS, isBuiltinPersona } from "./personas";
import { mergePersona } from "./persona-resolver";
import { getAdminDb } from "./firebase-admin";

/**
 * 서버(API 라우트/크론)용 리졸버. admin SDK로 Firestore 읽음.
 * 이 파일은 서버에서만 import 되어야 한다 — firebase-admin 의존성 때문에
 * 클라이언트 컴포넌트에서 import 하면 Next.js 번들러가 node:net 등을 브라우저로
 * 끌고 오려다 실패한다.
 *
 * uid가 없으면 기본값 그대로 반환.
 */
export async function resolvePersonaServer(
  uid: string | undefined,
  id: PersonaId
): Promise<Persona> {
  if (!isBuiltinPersona(id as string)) {
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
