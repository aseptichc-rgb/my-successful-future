import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

let adminApp: App | null = null;

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
      // 조용히 삼키면 이후 verifyIdToken/Firestore 호출이 원인 불명으로 실패하므로,
      // 근본 원인을 로그로 남긴다(키 값 자체는 절대 로깅하지 않음). ADC 폴백으로 진행.
      console.error(
        "[firebase-admin] FIREBASE_SERVICE_ACCOUNT_KEY 로드 실패 — 기본 자격(ADC)으로 폴백합니다:",
        err instanceof Error ? err.message : String(err),
      );
      adminApp = initializeApp({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      });
    }
  } else {
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
