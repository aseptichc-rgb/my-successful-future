import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * vitest 설정 — 순수 모듈(lib/**) 및 배포 스크립트(scripts/**) 의 순수 헬퍼 단위 테스트 전용.
 * tsconfig 의 "@/*" 경로 별칭을 vitest 는 스스로 읽지 않으므로 여기서 등록한다.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["lib/**/*.test.ts", "scripts/**/*.test.mjs"],
  },
});
