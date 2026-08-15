import { describe, expect, it } from "vitest";
import { FUTURE_SELF_DIMENSIONS } from "@/lib/futureSelf";
import {
  AFFIRMATION_TARGET_COUNT,
  FUTURE_SELF_TARGET_ANSWERS,
  listPendingTasks,
  pickPendingTask,
  type PendingTaskInput,
} from "@/lib/pendingTasks";

/** 아무것도 안 한 신규 사용자(온보딩 직후에도 대부분 여기 가깝다). */
const EMPTY: PendingTaskInput = {
  hasPortrait: false,
  executionPlanCount: 0,
};

/** 모든 과업을 끝낸 사용자. */
const COMPLETE: PendingTaskInput = {
  futureSelfAnswers: { dream: "책을 쓴다", daily: "아침에 글을 쓴다", work: "작가" },
  successAffirmations: ["나는 매일 쓴다", "나는 끝낸다", "나는 나를 믿는다"],
  hasPortrait: true,
  goals: ["매일 500자 쓰기"],
  executionPlanCount: 1,
};

const ids = (input: PendingTaskInput) => listPendingTasks(input).map((t) => t.id);

describe("listPendingTasks", () => {
  it("아무것도 없으면 목표·미래의 나·다짐·실행설계가 밀린 것으로 잡힌다", () => {
    expect(ids(EMPTY)).toEqual(["goals", "futureSelf", "affirmations", "plan"]);
  });

  it("미래의 나가 아직 모자라면 초상은 넣지 않는다 — 무엇을 하라는 건지 알 수 없다", () => {
    expect(ids(EMPTY)).not.toContain("portrait");
  });

  it("답변이 충분한데 초상이 없으면 그때 초상을 권한다", () => {
    expect(ids({ ...COMPLETE, hasPortrait: false })).toEqual(["portrait"]);
  });

  it("전부 채운 사용자에겐 아무것도 남지 않는다 — 알림이 멈춰야 한다", () => {
    expect(listPendingTasks(COMPLETE)).toEqual([]);
  });

  it("공백만 저장된 값은 채운 것으로 세지 않는다", () => {
    const blank: PendingTaskInput = {
      ...COMPLETE,
      goals: ["   "],
      successAffirmations: ["", "\n", "  "],
      futureSelfAnswers: { dream: "   ", daily: "", work: " " },
    };
    expect(ids(blank)).toContain("goals");
    expect(ids(blank)).toContain("affirmations");
    expect(ids(blank)).toContain("futureSelf");
  });

  it("배열이 아닌 손상된 값에도 터지지 않는다", () => {
    const broken = {
      ...EMPTY,
      goals: "매일 달리기",
      successAffirmations: null,
    } as unknown as PendingTaskInput;
    expect(() => listPendingTasks(broken)).not.toThrow();
    expect(ids(broken)).toContain("goals");
  });

  it("진행도는 채운 개수 / 목표 개수로 보고된다 (알림 본문 보간 재료)", () => {
    const partial: PendingTaskInput = {
      ...EMPTY,
      futureSelfAnswers: { dream: "책을 쓴다" },
      successAffirmations: ["나는 매일 쓴다"],
    };
    const tasks = listPendingTasks(partial);
    const futureSelf = tasks.find((t) => t.id === "futureSelf");
    expect(futureSelf).toMatchObject({ filled: 1, total: FUTURE_SELF_DIMENSIONS.length });
    expect(tasks.find((t) => t.id === "affirmations")).toMatchObject({
      filled: 1,
      total: AFFIRMATION_TARGET_COUNT,
    });
  });

  it("임계값에 도달하면 그 과업은 목록에서 빠진다", () => {
    const answers = Object.fromEntries(
      FUTURE_SELF_DIMENSIONS.slice(0, FUTURE_SELF_TARGET_ANSWERS).map((d) => [d, "채웠다"]),
    );
    expect(ids({ ...EMPTY, futureSelfAnswers: answers })).not.toContain("futureSelf");
  });

  it("탭 타깃은 설정 시트 딥링크와 1:1 로 대응한다", () => {
    const byId = new Map(listPendingTasks(EMPTY).map((t) => [t.id, t.target]));
    expect(byId.get("goals")).toBe("settings-goals");
    expect(byId.get("futureSelf")).toBe("settings-future-self");
    expect(byId.get("affirmations")).toBe("settings-affirmations");
    // 실행설계는 설정이 아니라 홈의 더 보기 안에 있다.
    expect(byId.get("plan")).toBe("home");
  });
});

describe("pickPendingTask", () => {
  it("밀린 게 없으면 null", () => {
    expect(pickPendingTask(COMPLETE, "uid-a", "2026-08-15")).toBeNull();
  });

  it("항상 목록 안의 과업 하나만 고른다", () => {
    const picked = pickPendingTask(EMPTY, "uid-a", "2026-08-15");
    expect(picked).not.toBeNull();
    expect(ids(EMPTY)).toContain(picked!.id);
  });

  it("같은 (uid, ymd) 는 항상 같은 결과 — 플랫폼 간 판정이 어긋나면 안 된다", () => {
    const first = pickPendingTask(EMPTY, "uid-a", "2026-08-15");
    for (let i = 0; i < 5; i++) {
      expect(pickPendingTask(EMPTY, "uid-a", "2026-08-15")).toEqual(first);
    }
  });

  it("날짜가 바뀌면 회전한다 — 같은 문구만 반복되면 opt-out 으로 이어진다", () => {
    const seen = new Set<string>();
    for (let d = 1; d <= 28; d++) {
      const ymd = `2026-08-${String(d).padStart(2, "0")}`;
      const picked = pickPendingTask(EMPTY, "uid-a", ymd);
      if (picked) seen.add(picked.id);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
