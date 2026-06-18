//
//  AnimaWidgetProvider.swift
//  AnimaWidget
//
//  TimelineProvider — App Group 캐시를 읽어 엔트리를 만든다. 네트워크 없음.
//  콘텐츠는 KST 자정에 하루 1회 바뀌므로, 다음 자정에 한 번 리로드하도록 타임라인을 짠다.
//  (메인 앱이 데이터를 갱신할 때마다 WidgetCenter.reloadAllTimelines() 로 즉시 갱신도 일어난다.)
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
            generatedAt: nil
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
        let entry = AnimaEntry(date: now, today: WidgetStore.loadToday())
        // 다음 KST 자정에 한 번 리로드(콘텐츠 일일 교체). 계산 실패 시 6시간 뒤로 안전 폴백.
        let next = Self.nextKstMidnight(after: now) ?? now.addingTimeInterval(6 * 60 * 60)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }

    /// KST(UTC+9) 기준 다음 자정의 Date. TimeZone 조회 실패 시 nil.
    static func nextKstMidnight(after date: Date) -> Date? {
        guard let kst = TimeZone(identifier: "Asia/Seoul") else { return nil }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = kst
        guard let startOfToday = cal.dateInterval(of: .day, for: date)?.start else { return nil }
        return cal.date(byAdding: .day, value: 1, to: startOfToday)
    }
}
