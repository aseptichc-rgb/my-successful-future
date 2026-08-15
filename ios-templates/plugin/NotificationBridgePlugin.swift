//
//  NotificationBridgePlugin.swift
//  App (메인 앱 타깃)
//
//  WebView(JS) → 네이티브 로컬 알림 브릿지. 웹이 넘긴 알림 설정(NotificationPrefs)과
//  로컬라이즈 문구로 UNUserNotificationCenter 예약을 재구성한다. 원격 푸시(APNs) 불사용.
//
//  정책은 웹(lib/notificationPolicy.ts)이 단일 소스로 소유한다 — 이 플러그인은
//  "받은 설정을 예약으로 옮기는 실행"만 한다. (Android WorkScheduler 와 같은 역할 분담.)
//
//  예약 구조 — 아침·저녁 모두 앞으로 14일치를 날짜별 개별 예약한다:
//    - 아침: anima.notify.morning.<yyyy-MM-dd>
//        · morningOverrides[날짜] 가 있으면 그 문구(= 그날의 실제 명언)를, 없으면 정적 폴백을 쓴다.
//        · 웹이 채워 주는 건 오늘/내일 두 날뿐이다(그 뒤 날짜의 명언은 아직 존재하지 않는다).
//          매일 앱을 여는 사용자는 창이 계속 밀리므로 사실상 항상 실제 명언을 받는다.
//        · 과거엔 매일 반복 트리거 하나였다. 날짜별로 다른 문구를 실을 수 없어 창 방식으로 바꿨다.
//    - 저녁/일요일 회고: anima.notify.evening.<yyyy-MM-dd>
//        · 일요일(weeklyReviewWeekday)은 저녁 문구 대신 주간 회고 문구로 대체(추가 발송 아님).
//        · 오늘 목표를 이미 체크했으면(todayGoalDone) 오늘 저녁은 침묵 — "한 일에는 침묵".
//          그 침묵 자리에만 eveningPendingTask(미완 과업 넛지)를 대신 넣는다. 총 발송량 증가 0.
//        · 미래 날짜는 "그날 할 일을 다 했는지" 를 알 수 없어 대체하지 않는다(현행 유지).
//
//  창 방식인 이유: 반복 트리거는 하루만 조건부로 끄거나 그날치 문구만 바꾸는 게 불가능하다.
//  앱을 열 때마다 웹이 sync 를 다시 불러 창을 앞으로 민다. 14일 이상 미접속 시 알림 자연 소멸 —
//  방치된 기기에 영구 알림을 남기지 않는 안전한 실패 방향.
//  pending 총량은 14(아침) + 14(저녁) = 28 로 iOS 한도(64)에 여유 있게 들어온다.
//
//  순수 Swift + CAPBridgedPlugin 자동 등록(Capacitor 6+) — WidgetBridgePlugin 과 동일 패턴.
//  JS 사용: const NotificationBridge = registerPlugin('NotificationBridge'); (lib/notificationBridge.ts)
//

import Foundation
import Capacitor
import UserNotifications

@objc(NotificationBridgePlugin)
public class NotificationBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NotificationBridgePlugin"
    public let jsName = "NotificationBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearAll", returnType: CAPPluginReturnPromise),
    ]

    /// 이 플러그인이 소유한 예약의 id 접두사 — 제거 시 다른 알림(향후 기능)을 건드리지 않는다.
    private static let idPrefix = "anima.notify."
    private static let morningIdPrefix = idPrefix + "morning."
    private static let eveningIdPrefix = idPrefix + "evening."
    /// 미리 예약해 두는 날 수. 아침·저녁 합쳐 28건으로 iOS 의 pending 한도(64)에 여유 있게 들어온다.
    private static let windowDays = 14

    /// 웹이 넘긴 설정·문구로 예약 전체를 재구성한다. 멱등 — 같은 입력이면 같은 예약.
    @objc func sync(_ call: CAPPluginCall) {
        let prefs = call.getObject("prefs") ?? [:]
        let texts = call.getObject("texts") ?? [:]
        let todayGoalDone = call.getBool("todayGoalDone") ?? false
        // 권한 프롬프트 허용 여부 — 설정 저장/목표 완주 직후(가치 체감 시점)에만 true.
        // false 면 이미 허용된 경우에만 조용히 예약한다(맥락 없는 프롬프트 금지).
        let allowPrompt = call.getBool("allowPrompt") ?? false
        // JS 의 요일(0=일요일)을 iOS DateComponents.weekday(1=일요일)로 변환.
        let weeklyReviewWeekday = (call.getInt("weeklyReviewWeekday") ?? 0) + 1

        // 신규 파라미터 — 구 웹(미전송)이면 빈 값이라 기존 동작 그대로다.
        let morningOverrides = call.getObject("morningOverrides") ?? [:]
        let pendingTask = call.getObject("eveningPendingTask")

        let morningEnabled = (prefs["morningEnabled"] as? Bool) ?? true
        let morningHour = Self.clampHour(prefs["morningHour"], fallback: 8)
        let eveningEnabled = (prefs["eveningEnabled"] as? Bool) ?? true
        let eveningHour = Self.clampHour(prefs["eveningHour"], fallback: 21)
        let weeklyEnabled = (prefs["weeklyReviewEnabled"] as? Bool) ?? true

        // 과업 넛지는 별도 토글이라, 저녁/회고를 다 꺼도 이것만 켜 두면 동작해야 한다
        // (서버가 pendingTaskEnabled=false 면 eveningPendingTask 를 아예 내려보내지 않는다).
        // Android WorkScheduler.scheduleDailyWinsReminder 의 취소 조건과 같은 판단.
        let anyEnabled = morningEnabled || eveningEnabled || weeklyEnabled || pendingTask != nil
        let center = UNUserNotificationCenter.current()

        guard anyEnabled else {
            // 전부 꺼짐 — 우리 예약만 제거하고 끝. 권한 요청도 띄우지 않는다.
            Self.removeOwnedPending(center) {
                call.resolve()
            }
            return
        }

        let schedule: () -> Void = {
            Self.removeOwnedPending(center) {
                if morningEnabled {
                    Self.scheduleMorningWindow(
                        center,
                        hour: morningHour,
                        texts: texts,
                        overrides: morningOverrides
                    )
                }
                Self.scheduleEveningWindow(
                    center,
                    eveningEnabled: eveningEnabled,
                    eveningHour: eveningHour,
                    weeklyEnabled: weeklyEnabled,
                    weeklyWeekday: weeklyReviewWeekday,
                    todayGoalDone: todayGoalDone,
                    texts: texts,
                    pendingTask: pendingTask
                )
                call.resolve(["authorized": true])
            }
        }
        let denied: () -> Void = {
            // 미허용 — 기존 예약을 정리하고 조용히 종료(웹 저장 흐름은 성공으로 유지).
            Self.removeOwnedPending(center) {
                call.resolve(["authorized": false])
            }
        }

        if allowPrompt {
            // 설정 저장/목표 완주 직후 — 맥락 있는 권한 요청. 이미 결정된 상태면 시스템이 무시.
            center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
                granted ? schedule() : denied()
            }
        } else {
            // 조용한 재동기화(홈 방문 등) — 이미 허용된 경우에만 예약. 프롬프트 금지.
            center.getNotificationSettings { settings in
                switch settings.authorizationStatus {
                case .authorized, .provisional, .ephemeral:
                    schedule()
                default:
                    denied()
                }
            }
        }
    }

    /// 로그아웃/계정 삭제 — 우리 예약 전부 제거.
    @objc func clearAll(_ call: CAPPluginCall) {
        Self.removeOwnedPending(UNUserNotificationCenter.current()) {
            call.resolve()
        }
    }

    // MARK: - 예약 구성

    /**
     아침 창 — 날짜별로 그날의 명언 문구를 실어 예약한다.

     overrides 의 키는 **기기 로컬 달력 날짜**(yyyy-MM-dd)다. 알림이 로컬 시각에 울리므로
     서버의 KST ymd 가 아니라 로컬 날짜로 맞춰야 "오늘 알림에 오늘 카드의 명언"이 된다.
     */
    private static func scheduleMorningWindow(
        _ center: UNUserNotificationCenter,
        hour: Int,
        texts: JSObject,
        overrides: JSObject
    ) {
        let calendar = Calendar.current
        let now = Date()
        let formatter = dayFormatter()
        let fallbackTitle = text(texts, "morning", "title")
        let fallbackBody = text(texts, "morning", "body")

        for offset in 0..<windowDays {
            guard let day = calendar.date(byAdding: .day, value: offset, to: now) else { continue }
            var fire = calendar.dateComponents([.year, .month, .day], from: day)
            fire.hour = hour
            fire.minute = 0
            // 오늘 아침 시각이 이미 지났으면 예약해도 안 울린다 — 건너뛴다.
            if offset == 0, let fireDate = calendar.date(from: fire), fireDate <= now { continue }

            let key = formatter.string(from: day)
            let override = overrides[key] as? JSObject
            center.add(UNNotificationRequest(
                identifier: morningIdPrefix + key,
                content: content(
                    title: nonEmpty(override?["title"]) ?? fallbackTitle,
                    body: nonEmpty(override?["body"]) ?? fallbackBody
                ),
                trigger: UNCalendarNotificationTrigger(dateMatching: fire, repeats: false)
            ))
        }
    }

    private static func scheduleEveningWindow(
        _ center: UNUserNotificationCenter,
        eveningEnabled: Bool,
        eveningHour: Int,
        weeklyEnabled: Bool,
        weeklyWeekday: Int,
        todayGoalDone: Bool,
        texts: JSObject,
        pendingTask: JSObject?
    ) {
        guard eveningEnabled || weeklyEnabled || pendingTask != nil else { return }
        let calendar = Calendar.current
        let now = Date()
        let formatter = dayFormatter()

        for offset in 0..<windowDays {
            guard let day = calendar.date(byAdding: .day, value: offset, to: now) else { continue }
            var fire = calendar.dateComponents([.year, .month, .day], from: day)
            fire.hour = eveningHour
            fire.minute = 0
            // 오늘 저녁 시각이 이미 지났으면 예약해도 안 울린다 — 건너뛴다.
            if offset == 0, let fireDate = calendar.date(from: fire), fireDate <= now { continue }

            let weekday = calendar.component(.weekday, from: day)
            let isReviewDay = weeklyEnabled && weekday == weeklyWeekday

            var title: String
            var body: String
            if isReviewDay {
                title = text(texts, "weekly", "title")
                body = text(texts, "weekly", "body")
            } else if eveningEnabled && !(offset == 0 && todayGoalDone) {
                title = text(texts, "evening", "title")
                body = text(texts, "evening", "body")
            } else {
                // 이 자리는 침묵한다(저녁 끔 또는 "한 일에는 침묵").
                // 오늘(D+0)에 한해 미완 과업 넛지로 대신 채운다 — 미래 날짜는 그날의 진척을
                // 알 수 없으므로 대체하지 않는다.
                guard offset == 0,
                      let pendingTitle = nonEmpty(pendingTask?["title"]),
                      let pendingBody = nonEmpty(pendingTask?["body"])
                else { continue }
                title = pendingTitle
                body = pendingBody
            }

            center.add(UNNotificationRequest(
                identifier: eveningIdPrefix + formatter.string(from: day),
                content: content(title: title, body: body),
                trigger: UNCalendarNotificationTrigger(dateMatching: fire, repeats: false)
            ))
        }
    }

    // MARK: - 헬퍼

    /// 날짜 키 포맷터.
    /// ⚠️ locale/calendar 를 고정하지 않으면 태국(불교력)·일본(和暦) 등에서 "2569-08-15" 같은
    ///    값이 나와 웹이 넘긴 morningOverrides 키와 영영 매칭되지 않는다.
    private static func dayFormatter() -> DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = "yyyy-MM-dd"
        return f
    }

    private static func content(title: String, body: String) -> UNMutableNotificationContent {
        let c = UNMutableNotificationContent()
        c.title = title
        c.body = body
        c.sound = .default
        return c
    }

    /// 비어 있지 않은 문자열만 통과 — 빈 문구가 정적 폴백을 덮어쓰지 않게 한다.
    private static func nonEmpty(_ raw: Any?) -> String? {
        guard let s = raw as? String, !s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else { return nil }
        return s
    }

    /// texts.morning.title 형태의 중첩 JSObject 에서 문구 추출. 누락 시 빈 문자열 —
    /// 빈 제목 알림은 iOS 가 표시하지 않으므로 잘못된 문구가 나가는 것보다 안전.
    private static func text(_ texts: JSObject, _ kind: String, _ field: String) -> String {
        return ((texts[kind] as? JSObject)?[field] as? String) ?? ""
    }

    private static func clampHour(_ raw: Any?, fallback: Int) -> Int {
        let n = (raw as? Int) ?? (raw as? Double).map(Int.init) ?? fallback
        return min(23, max(0, n))
    }

    /// idPrefix 로 시작하는 우리 예약만 제거한 뒤 completion 실행.
    private static func removeOwnedPending(
        _ center: UNUserNotificationCenter,
        completion: @escaping () -> Void
    ) {
        center.getPendingNotificationRequests { requests in
            let owned = requests.map(\.identifier).filter { $0.hasPrefix(idPrefix) }
            if !owned.isEmpty {
                center.removePendingNotificationRequests(withIdentifiers: owned)
            }
            completion()
        }
    }
}
