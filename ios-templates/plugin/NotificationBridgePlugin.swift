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
//  예약 구조:
//    - 아침: 매일 반복 UNCalendarNotificationTrigger (id: anima.notify.morning)
//    - 저녁/일요일 회고: 앞으로 14일치 날짜별 개별 예약 (id: anima.notify.evening.<yyyy-MM-dd>)
//        · 오늘 목표를 이미 체크했으면(todayGoalDone) 오늘 건만 생략 — "한 일에는 침묵".
//        · 일요일(weeklyReviewWeekday)은 저녁 문구 대신 주간 회고 문구로 대체(추가 발송 아님).
//        · 반복 트리거는 하루만 조건부로 끌 수 없어 날짜별로 예약하고, 앱을 열 때마다
//          웹이 sync 를 다시 불러 창을 앞으로 민다. 14일 이상 미접속 시 알림 자연 소멸 —
//          방치된 기기에 영구 알림을 남기지 않는 안전한 실패 방향.
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
    private static let morningId = idPrefix + "morning"
    private static let eveningIdPrefix = idPrefix + "evening."
    /// 저녁 알림을 미리 예약해 두는 날 수. iOS 의 pending 한도(64)에 여유 있게 들어온다.
    private static let eveningWindowDays = 14

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

        let morningEnabled = (prefs["morningEnabled"] as? Bool) ?? true
        let morningHour = Self.clampHour(prefs["morningHour"], fallback: 8)
        let eveningEnabled = (prefs["eveningEnabled"] as? Bool) ?? true
        let eveningHour = Self.clampHour(prefs["eveningHour"], fallback: 21)
        let weeklyEnabled = (prefs["weeklyReviewEnabled"] as? Bool) ?? true

        let anyEnabled = morningEnabled || eveningEnabled || weeklyEnabled
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
                    Self.scheduleMorning(
                        center,
                        hour: morningHour,
                        title: Self.text(texts, "morning", "title"),
                        body: Self.text(texts, "morning", "body")
                    )
                }
                Self.scheduleEveningWindow(
                    center,
                    eveningEnabled: eveningEnabled,
                    eveningHour: eveningHour,
                    weeklyEnabled: weeklyEnabled,
                    weeklyWeekday: weeklyReviewWeekday,
                    todayGoalDone: todayGoalDone,
                    texts: texts
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

    private static func scheduleMorning(
        _ center: UNUserNotificationCenter,
        hour: Int,
        title: String,
        body: String
    ) {
        var components = DateComponents()
        components.hour = hour
        components.minute = 0
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: true)
        center.add(UNNotificationRequest(
            identifier: morningId,
            content: content(title: title, body: body),
            trigger: trigger
        ))
    }

    private static func scheduleEveningWindow(
        _ center: UNUserNotificationCenter,
        eveningEnabled: Bool,
        eveningHour: Int,
        weeklyEnabled: Bool,
        weeklyWeekday: Int,
        todayGoalDone: Bool,
        texts: JSObject
    ) {
        guard eveningEnabled || weeklyEnabled else { return }
        let calendar = Calendar.current
        let now = Date()
        let dayFormatter = DateFormatter()
        dayFormatter.dateFormat = "yyyy-MM-dd"

        for offset in 0..<eveningWindowDays {
            guard let day = calendar.date(byAdding: .day, value: offset, to: now) else { continue }
            var fire = calendar.dateComponents([.year, .month, .day], from: day)
            fire.hour = eveningHour
            fire.minute = 0
            // 오늘 저녁 시각이 이미 지났으면 예약해도 안 울린다 — 건너뛴다.
            if offset == 0, let fireDate = calendar.date(from: fire), fireDate <= now { continue }

            let weekday = calendar.component(.weekday, from: day)
            let isReviewDay = weeklyEnabled && weekday == weeklyWeekday
            if !isReviewDay {
                guard eveningEnabled else { continue }
                // "한 일에는 침묵" — 오늘 목표를 이미 체크했으면 오늘 건만 생략.
                if offset == 0 && todayGoalDone { continue }
            }

            let kind = isReviewDay ? "weekly" : "evening"
            center.add(UNNotificationRequest(
                identifier: eveningIdPrefix + dayFormatter.string(from: day),
                content: content(
                    title: text(texts, kind, "title"),
                    body: text(texts, kind, "body")
                ),
                trigger: UNCalendarNotificationTrigger(dateMatching: fire, repeats: false)
            ))
        }
    }

    // MARK: - 헬퍼

    private static func content(title: String, body: String) -> UNMutableNotificationContent {
        let c = UNMutableNotificationContent()
        c.title = title
        c.body = body
        c.sound = .default
        return c
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
