//
//  AnimaWidgetProvider.swift
//  AnimaWidget
//
//  TimelineProvider — App Group 캐시를 읽어 엔트리를 만든다. 네트워크 없음.
//  캐시의 upcoming 미리보기(다음 7일치 명언)로 자정 엔트리를 미리 예약해, 앱을 열지 않아도
//  날짜가 바뀌면 위젯 명언이 자동 교체된다. 앱이 캐시를 갱신하면 reloadAllTimelines 로 즉시 반영.
//

import WidgetKit
import SwiftUI

struct AnimaEntry: TimelineEntry {
    let date: Date
    let today: WidgetToday?
    /// 캐시가 비어 로그인/앱 실행 유도가 필요한 상태인지.
    var isEmpty: Bool { today?.primarySlot == nil }

    /// 위젯 갤러리/플레이스홀더용 샘플 — 실제 데이터가 없을 때 미리보기.
    static let sample = AnimaEntry(
        date: Date(timeIntervalSince1970: 0),
        today: WidgetToday(
            ymd: nil,
            slots: [WidgetSlot(
                kind: "motivation",
                text: "오늘의 나는 어제보다 한 걸음 더 나아간다.",
                author: "Anima",
                goalsSnapshot: [],
                gradient: nil
            )],
            todayProgress: WidgetProgress(affirmation: true, actions: false, wins: false),
            streakCount: 7,
            affirmations: ["나는 약속을 지키는 사람이다."],
            futureVision: WidgetFutureVision(
                title: "이름이 불리는 오후",
                teaser: "회의실 문이 열리고, 사람들이 내 이름을 부른다. 한때 꿈이었던 그 일이 지금 내 하루다."
            ),
            goalsAchievedCount: 1,
            goalsTotalCount: 3,
            generatedAt: nil,
            upcoming: nil
        )
    )
}

struct AnimaProvider: TimelineProvider {
    func placeholder(in context: Context) -> AnimaEntry {
        AnimaEntry.sample
    }

    func getSnapshot(in context: Context, completion: @escaping (AnimaEntry) -> Void) {
        // 갤러리 미리보기는 샘플, 실기기 스냅샷은 실제 캐시.
        let entry = context.isPreview
            ? AnimaEntry.sample
            : AnimaEntry(date: Date(), today: WidgetStore.loadToday())
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<AnimaEntry>) -> Void) {
        let now = Date()
        let cached = WidgetStore.loadToday()
        // 캐시 ymd 가 이미 지난 날짜면 upcoming 미리보기로 "오늘 명언" 을 보정해 그린다.
        var entries: [AnimaEntry] = [AnimaEntry(date: now, today: Self.effectiveToday(cached, now: now))]

        // 서버가 미리 내려준 다음 날들 미리보기로 자정 엔트리를 예약한다 — 앱을 열지 않아도
        // 날짜가 바뀌는 순간 위젯 명언이 자동 교체된다. (익스텐션은 인증/네트워크를 못 쓰므로
        // 타임라인 예약이 유일한 자율 갱신 수단이다.)
        if let cached, let upcoming = cached.upcoming {
            for item in upcoming.sorted(by: { $0.ymd < $1.ymd }) {
                guard let fire = Self.kstMidnight(ofYmd: item.ymd), fire > now else { continue }
                entries.append(AnimaEntry(date: fire, today: cached.replacingForPreview(item)))
            }
        }

        if entries.count > 1 {
            // 예약분 소진 시 리로드(.atEnd). 그 사이 앱이 캐시를 갱신하면 reloadAllTimelines 가
            // 즉시 이 타임라인을 새로 만든다.
            completion(Timeline(entries: entries, policy: .atEnd))
        } else {
            // 미리보기 없는 옛 캐시 — 기존처럼 다음 KST 자정 리로드. 계산 실패 시 6시간 폴백.
            let next = Self.nextKstMidnight(after: now)
                ?? now.addingTimeInterval(Self.fallbackReloadInterval)
            completion(Timeline(entries: entries, policy: .after(next)))
        }
    }

    /// KST(UTC+9) 기준 다음 자정의 Date. TimeZone 조회 실패 시 nil.
    static func nextKstMidnight(after date: Date) -> Date? {
        guard let kst = TimeZone(identifier: "Asia/Seoul") else { return nil }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = kst
        guard let startOfToday = cal.dateInterval(of: .day, for: date)?.start else { return nil }
        return cal.date(byAdding: .day, value: 1, to: startOfToday)
    }

    /// 자정 계산 실패 시 안전 폴백 리로드 간격(6시간).
    static let fallbackReloadInterval: TimeInterval = 6 * 60 * 60

    /// KST YYYY-MM-DD 파서/포매터 — ymd 문자열과 Date 상호 변환 전용.
    /// (DateFormatter 는 iOS 7+ 에서 스레드 안전 — 읽기 전용 공유가 안전하다.)
    private static let kstYmdFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "Asia/Seoul")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// Date → KST 기준 YYYY-MM-DD.
    static func kstYmd(of date: Date) -> String {
        kstYmdFormatter.string(from: date)
    }

    /// KST YYYY-MM-DD → 그날 KST 자정 Date. 형식이 깨졌으면 nil.
    static func kstMidnight(ofYmd ymd: String) -> Date? {
        kstYmdFormatter.date(from: ymd)
    }

    /// 캐시 ymd 가 이미 지난 날짜면(며칠 앱 미실행 후 타임라인 재생성 등) upcoming 에서
    /// 오늘 자(없으면 오늘에 가장 가까운 과거) 미리보기로 교체 — "어제 명언 고착" 을 막는다.
    /// YYYY-MM-DD 형식이라 문자열 비교가 곧 날짜 비교다.
    static func effectiveToday(_ cached: WidgetToday?, now: Date) -> WidgetToday? {
        let todayYmd = kstYmd(of: now)
        guard
            let cached,
            let cachedYmd = cached.ymd,
            cachedYmd < todayYmd,
            let item = cached.upcoming?
                .filter({ $0.ymd <= todayYmd })
                .max(by: { $0.ymd < $1.ymd })
        else { return cached }
        return cached.replacingForPreview(item)
    }
}
