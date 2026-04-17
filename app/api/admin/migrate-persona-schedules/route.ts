/**
 * POST /api/admin/migrate-persona-schedules
 *
 * 일회성 마이그레이션: users/{uid}/customPersonaSchedules/* 문서를
 * 같은 uid 아래 users/{uid}/personaSchedules/* 로 복사한 뒤 원본을 삭제한다.
 *
 * 인증: CRON_SECRET 헤더 또는 ?key= 쿼리. 미설정 시 로컬 개발 편의를 위해 통과.
 * 여러 번 호출해도 멱등 — 이미 옮겨진 문서는 새 위치에 존재하므로 source 만 정리된다.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization") || "";
  if (auth === `Bearer ${secret}`) return true;
  return req.nextUrl.searchParams.get("key") === secret;
}

interface MigrationResult {
  scanned: number;
  copied: number;
  alreadyMigrated: number;
  deleted: number;
  errors: Array<{ uid: string; personaId: string; message: string }>;
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = getAdminDb();
  const out: MigrationResult = {
    scanned: 0,
    copied: 0,
    alreadyMigrated: 0,
    deleted: 0,
    errors: [],
  };

  let snap;
  try {
    snap = await db.collectionGroup("customPersonaSchedules").get();
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "collectionGroup 스캔 실패",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }

  for (const docSnap of snap.docs) {
    out.scanned += 1;
    // 경로: users/{uid}/customPersonaSchedules/{personaId}
    const parentUserRef = docSnap.ref.parent.parent;
    if (!parentUserRef) continue;
    const uid = parentUserRef.id;
    const personaId = docSnap.id;
    const data = docSnap.data() || {};

    const targetRef = db
      .collection("users")
      .doc(uid)
      .collection("personaSchedules")
      .doc(personaId);

    try {
      const existing = await targetRef.get();
      if (existing.exists) {
        out.alreadyMigrated += 1;
      } else {
        await targetRef.set({
          ...data,
          personaId,
          uid,
          // 원본에 createdAt 가 없었으면 지금 기준으로 보존
          createdAt: data.createdAt ?? FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        out.copied += 1;
      }

      await docSnap.ref.delete();
      out.deleted += 1;
    } catch (err) {
      out.errors.push({
        uid,
        personaId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ ok: true, ...out });
}

export const GET = POST;
