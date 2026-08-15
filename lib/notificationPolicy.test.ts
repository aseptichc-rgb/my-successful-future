import { describe, expect, it } from "vitest";
import { WEEKLY_REVIEW_WEEKDAY } from "@/lib/homeMode";
import { addKstDays, kstWeekday } from "@/lib/kstDate";
import {
  DEFAULT_EVENING_HOUR,
  DEFAULT_MORNING_HOUR,
  PENDING_NUDGE_DAYS_PER_WEEK,
  decideEveningSlot,
  isPendingNudgeDay,
  isWeeklyReviewDay,
  normalizeNotificationPrefs,
  shouldSendEveningReminder,
  summarizeNotificationHours,
} from "@/lib/notificationPolicy";

describe("normalizeNotificationPrefs", () => {
  it("미설정(레거시 사용자)이면 전부 켜짐 + 08:00/21:00 — 기존 Android 동작 보존", () => {
    expect(normalizeNotificationPrefs(undefined)).toEqual({
      morningEnabled: true,
      morningHour: DEFAULT_MORNING_HOUR,
      eveningEnabled: true,
      eveningHour: DEFAULT_EVENING_HOUR,
      weeklyReviewEnabled: true,
      pendingTaskEnabled: true,
    });
  });

  it("pendingTaskEnabled 누락(신규 필드 이전 문서)이면 켜짐으로 채운다", () => {
    const prefs = normalizeNotificationPrefs({
      morningEnabled: false,
      morningHour: 6,
      eveningEnabled: true,
      eveningHour: 22,
      weeklyReviewEnabled: false,
    });
    expect(prefs.pendingTaskEnabled).toBe(true);
    // 나머지 필드는 원본을 그대로 보존해야 한다.
    expect(prefs.morningEnabled).toBe(false);
    expect(prefs.morningHour).toBe(6);
    expect(prefs.eveningHour).toBe(22);
  });

  it("사용자가 끈 값은 존중한다", () => {
    expect(normalizeNotificationPrefs({ pendingTaskEnabled: false }).pendingTaskEnabled).toBe(false);
  });

  it("깨진 시각은 0~23 으로 클램프하고, 숫자가 아니면 기본값", () => {
    expect(normalizeNotificationPrefs({ morningHour: 99 }).morningHour).toBe(23);
    expect(normalizeNotificationPrefs({ morningHour: -5 }).morningHour).toBe(0);
    expect(normalizeNotificationPrefs({ morningHour: "아침" }).morningHour).toBe(
      DEFAULT_MORNING_HOUR,
    );
  });
});

describe("shouldSendEveningReminder", () => {
  it("이미 한 일에는 침묵", () => {
    expect(shouldSendEveningReminder(true)).toBe(false);
  });

  it("모르면(오프라인·조회 실패) 보낸다 — 놓친 리마인더가 더 비싸다", () => {
    expect(shouldSendEveningReminder(undefined)).toBe(true);
    expect(shouldSendEveningReminder(false)).toBe(true);
  });
});

describe("decideEveningSlot", () => {
  const base = {
    todayActionsDone: false,
    eveningEnabled: true,
    pendingTaskEnabled: true,
    hasPendingTask: true,
    isNudgeDay: true,
  };

  it("오늘 할 일이 남아 있으면 목표 넛지가 최우선 — 과업을 권해 본래 리마인더를 묻지 않는다", () => {
    expect(decideEveningSlot(base)).toBe("goalNudge");
  });

  it("오늘 할 일을 다 했고 넛지 허용일이면 침묵 슬롯을 과업 넛지로 대체", () => {
    expect(decideEveningSlot({ ...base, todayActionsDone: true })).toBe("pendingTask");
  });

  it("넛지 허용일이 아니면 침묵(현행 유지) — 주간 상한이 여기서 걸린다", () => {
    expect(decideEveningSlot({ ...base, todayActionsDone: true, isNudgeDay: false })).toBe("silent");
  });

  it("밀린 과업이 없으면 침묵", () => {
    expect(decideEveningSlot({ ...base, todayActionsDone: true, hasPendingTask: false })).toBe(
      "silent",
    );
  });

  it("사용자가 과업 넛지를 껐으면 침묵", () => {
    expect(decideEveningSlot({ ...base, todayActionsDone: true, pendingTaskEnabled: false })).toBe(
      "silent",
    );
  });

  it("저녁 리마인더를 껐어도 과업 넛지는 별도 토글로 동작한다", () => {
    expect(decideEveningSlot({ ...base, eveningEnabled: false })).toBe("pendingTask");
  });

  it("저녁·과업 둘 다 껐으면 아무것도 보내지 않는다", () => {
    expect(
      decideEveningSlot({ ...base, eveningEnabled: false, pendingTaskEnabled: false }),
    ).toBe("silent");
  });
});

describe("isPendingNudgeDay", () => {
  /** ymd 로부터 7일치 요일별 판정 — 한 주 안에 몇 번 허용되는지 센다. */
  function nudgeDaysInWeek(uid: string, startYmd: string): number[] {
    const days: number[] = [];
    for (let i = 0; i < 7; i++) {
      const ymd = addKstDays(startYmd, i);
      if (isPendingNudgeDay(uid, ymd)) days.push(kstWeekday(ymd));
    }
    return days;
  }

  it("한 주에 정확히 상한 개수만큼만 허용한다", () => {
    // 여러 uid 로 확인 — 시드에 따라 개수가 흔들리면 안 된다.
    for (const uid of ["uid-a", "uid-b", "uid-c", "sOmEfIrEbAsEuId123"]) {
      expect(nudgeDaysInWeek(uid, "2026-08-17")).toHaveLength(PENDING_NUDGE_DAYS_PER_WEEK);
    }
  });

  it("주간 회고 요일은 절대 포함하지 않는다 — 저녁 슬롯이 이미 회고에 점유돼 있다", () => {
    for (const uid of ["uid-a", "uid-b", "uid-c"]) {
      // 6주치를 훑어 한 번도 회고 요일이 뽑히지 않는지 확인.
      for (let w = 0; w < 6; w++) {
        const days = nudgeDaysInWeek(uid, addKstDays("2026-08-17", w * 7));
        expect(days).not.toContain(WEEKLY_REVIEW_WEEKDAY);
      }
    }
  });

  it("같은 (uid, ymd) 는 항상 같은 답 — Android(런타임)와 iOS(예약 시점)가 어긋나면 안 된다", () => {
    const first = isPendingNudgeDay("uid-a", "2026-08-19");
    for (let i = 0; i < 5; i++) {
      expect(isPendingNudgeDay("uid-a", "2026-08-19")).toBe(first);
    }
  });

  it("사용자마다 요일이 흩어진다 — 전원이 같은 날 알림을 받지 않는다", () => {
    const sets = ["uid-a", "uid-b", "uid-c", "uid-d", "uid-e", "uid-f"].map((uid) =>
      nudgeDaysInWeek(uid, "2026-08-17").join(","),
    );
    expect(new Set(sets).size).toBeGreaterThan(1);
  });

  it("깨진 ymd 는 조용히 false — 알림 조립이 예외로 죽지 않는다", () => {
    expect(isPendingNudgeDay("uid-a", "")).toBe(false);
    expect(isPendingNudgeDay("uid-a", "2026-13-99")).toBe(false);
    expect(isPendingNudgeDay("uid-a", "not-a-date")).toBe(false);
  });
});

describe("isWeeklyReviewDay", () => {
  it("일요일만 회고일", () => {
    expect(isWeeklyReviewDay(0)).toBe(true);
    expect(isWeeklyReviewDay(3)).toBe(false);
  });
});

describe("summarizeNotificationHours", () => {
  it("켜진 알림 시각만 나열", () => {
    expect(summarizeNotificationHours(normalizeNotificationPrefs(undefined))).toBe("08:00 · 21:00");
  });

  it("전부 꺼져 있으면 null (호출부가 '꺼짐' 라벨로 대체)", () => {
    expect(
      summarizeNotificationHours(
        normalizeNotificationPrefs({
          morningEnabled: false,
          eveningEnabled: false,
          weeklyReviewEnabled: false,
          pendingTaskEnabled: false,
        }),
      ),
    ).toBeNull();
  });

  it("과업 넛지만 켜져 있어도 저녁 시각을 표기한다 — '꺼짐'인데 알림이 오면 안 된다", () => {
    expect(
      summarizeNotificationHours(
        normalizeNotificationPrefs({
          morningEnabled: false,
          eveningEnabled: false,
          weeklyReviewEnabled: false,
          pendingTaskEnabled: true,
          eveningHour: 20,
        }),
      ),
    ).toBe("20:00");
  });
});
