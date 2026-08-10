import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

let adminApp: App | null = null;

/** 자격증명 오류를 삼킬지(로컬) 즉시 드러낼지(운영) 가르는 기준. */
function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function getAdminApp(): App {
  if (adminApp) return adminApp;
  if (getApps().length > 0) {
    adminApp = getApps()[0];
    return adminApp;
  }

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountKey) {
    try {
      const serviceAccount = JSON.parse(serviceAccountKey);
      adminApp = initializeApp({
        credential: cert(serviceAccount),
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      });
    } catch (err) {
      // FIREBASE_SERVICE_ACCOUNT_KEY 가 설정됐으나 파싱/인증서 로드에 실패한 상태.
      // 키 값 자체는 절대 로깅하지 않고 원인만 남긴다.
      const cause = err instanceof Error ? err.message : String(err);
      // 운영(Vercel)에는 ADC 가 없다. 폴백하면 initializeApp 은 성공한 뒤 이후의 모든
      // verifyIdToken/Firestore 호출이 원인 불명으로 실패해 장애 원인 추적이 어려워진다.
      // → 설정 오류임을 즉시 드러낸다(fail-fast). ADC 폴백은 로컬/CI 에서만 허용.
      if (isProduction()) {
        throw new Error(
          `[firebase-admin] FIREBASE_SERVICE_ACCOUNT_KEY 를 로드하지 못했습니다 (${cause}). ` +
            "운영 환경에서는 ADC 로 폴백하지 않습니다 — 환경변수 값을 확인하세요.",
        );
      }
      console.error(
        `[firebase-admin] FIREBASE_SERVICE_ACCOUNT_KEY 로드 실패 (${cause}) — ` +
          "개발 환경이라 기본 자격(ADC)으로 폴백합니다.",
      );
      adminApp = initializeApp({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      });
    }
  } else {
    // 키 미설정. GCP 런타임처럼 ADC 가 실제로 존재하는 환경일 수 있어 막지는 않되,
    // 운영에서 이 경로를 타면 배포 설정 누락일 가능성이 높으므로 눈에 띄게 남긴다.
    if (isProduction()) {
      console.warn(
        "[firebase-admin] 운영 환경인데 FIREBASE_SERVICE_ACCOUNT_KEY 가 없습니다 — " +
          "기본 자격(ADC)에 의존합니다. Vercel 배포라면 환경변수 누락입니다.",
      );
    }
    adminApp = initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  }
  return adminApp;
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}
