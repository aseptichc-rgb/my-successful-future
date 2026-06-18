//
//  AnimaWidgetModel.swift
//  AnimaWidget
//
//  App Group 공유 캐시에서 "오늘의 카드"를 읽어 위젯이 렌더링할 모델로 디코드한다.
//
//  데이터 흐름(Android QuoteCache 와 동일한 캐시 모델):
//    메인 앱(WKWebView)이 /api/widget/today 를 호출 → WidgetBridge 플러그인이 응답 JSON 을
//    App Group UserDefaults 에 쓰고 WidgetCenter.reloadAllTimelines() 호출 → 위젯은 이 캐시만
//    읽어 그린다. 위젯 익스텐션 안에서는 네트워크/Firebase 토큰을 다루지 않는다.
//
//  JSON 스키마는 웹의 types/index.ts 의 WidgetTodayResponse 와 1:1 대응(필요한 부분만 선택 디코드).
//

import SwiftUI

// MARK: - 공유 저장소 상수 (메인 앱 WidgetBridgePlugin 과 반드시 동일해야 함)

enum WidgetStore {
    /// App Group ID — 메인 앱과 위젯이 공유. Apple Developer 콘솔에 동일 ID 로 등록돼야 한다.
    static let appGroupId = "group.com.michaelkim.anima"
    /// 공유 UserDefaults 의 키 — WidgetTodayResponse JSON 문자열을 담는다.
    static let todayKey = "widget_today_json"

    /// App Group 캐시에서 오늘 카드를 읽어 디코드. 없거나 손상되면 nil.
    /// 위젯/익스텐션은 throw 를 못 쓰므로 모든 실패를 nil 로 안전 폴백한다.
    static func loadToday() -> WidgetToday? {
        guard
            let defaults = UserDefaults(suiteName: appGroupId),
            let raw = defaults.string(forKey: todayKey),
            let data = raw.data(using: .utf8)
        else { return nil }
        return try? JSONDecoder().decode(WidgetToday.self, from: data)
    }
}

// MARK: - 디코드 모델 (WidgetTodayResponse 부분 집합)

struct WidgetGradient: Codable {
    let from: String
    let to: String
    let angle: Double?
    let tone: String?
}

struct WidgetSlot: Codable {
    let kind: String?
    let text: String
    let author: String
    let goalsSnapshot: [String]?
    let gradient: WidgetGradient?
}

struct WidgetProgress: Codable {
    let affirmation: Bool
    let actions: Bool
    let wins: Bool

    /// 오늘 완료한 항목 수(0~3).
    var doneCount: Int {
        [affirmation, actions, wins].filter { $0 }.count
    }

    /// 진척도가 전무한 빈 상태인지(미완료 0개) — 빈 상태 표시 판단에 사용.
    static let total = 3
}

/// "그 꿈을 사는 하루"(미래 일상 비전) 위젯 티저 — 제목 + 한 토막.
/// 비전 미생성/옛 응답이면 응답에서 통째로 생략되므로 WidgetToday 에서 옵셔널로 둔다.
struct WidgetFutureVision: Codable {
    let title: String
    let teaser: String
}

struct WidgetToday: Codable {
    let ymd: String?
    let slots: [WidgetSlot]?
    let todayProgress: WidgetProgress?
    let streakCount: Int?
    let affirmations: [String]?
    let futureVision: WidgetFutureVision?
    let goalsAchievedCount: Int?
    let goalsTotalCount: Int?
    let generatedAt: String?

    /// "지금 보여야 할" 슬롯 1건(= 오늘의 동기부여 카드). 웹 /home 과 동일하게 첫 장만.
    var primarySlot: WidgetSlot? { slots?.first }

    var progress: WidgetProgress {
        todayProgress ?? WidgetProgress(affirmation: false, actions: false, wins: false)
    }

    var streak: Int { max(0, streakCount ?? 0) }

    /// "이번 달 목표" 한 줄 카운트용 — 옛 응답엔 없어 0 폴백(total 0 이면 섹션 생략).
    var goalsTotal: Int { max(0, goalsTotalCount ?? 0) }
    var goalsAchieved: Int { min(max(0, goalsAchievedCount ?? 0), goalsTotal) }
}

// MARK: - 디자인 상수 (Android WidgetUi.kt 와 통일)

enum WidgetTheme {
    /// 인디고 잉크 — 크림 배경 위 본문/제목. (Android widget_ink #1E1B4B)
    static let ink = Color(hex: 0x1E1B4B)
    /// 소울 오렌지 — 완료/강조. (Android widget_accent_soul #D85A30)
    static let accent = Color(hex: 0xD85A30)
    /// 크림 배경 — 홈 위젯 카드 바탕. (앱 backgroundColor #F0EDE6)
    static let cream = Color(hex: 0xF0EDE6)

    // 투명도(Android WidgetUi 의 alpha 값과 동일)
    static let metaOpacity = 0.36      // 작가/메타
    static let dimOpacity = 0.62       // 보조 텍스트
    static let todoOpacity = 0.28      // 미완료 체크 스트로크

    // 레이아웃 매직넘버 제거용 상수
    static let cardCorner: CGFloat = 16
    static let cardPadding: CGFloat = 14
}

extension Color {
    /// 0xRRGGBB 정수에서 불투명 Color 생성.
    init(hex: UInt32) {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >> 8) & 0xFF) / 255.0
        let b = Double(hex & 0xFF) / 255.0
        self.init(.sRGB, red: r, green: g, blue: b, opacity: 1)
    }

    /// "#RRGGBB" / "RRGGBB" 문자열에서 Color 생성. 파싱 실패 시 fallback.
    init(hexString: String?, fallback: Color) {
        guard var s = hexString?.trimmingCharacters(in: .whitespaces), !s.isEmpty else {
            self = fallback
            return
        }
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let value = UInt32(s, radix: 16) else {
            self = fallback
            return
        }
        self.init(hex: value)
    }
}
