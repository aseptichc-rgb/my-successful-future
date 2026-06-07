//
//  AnimaWidgetViews.swift
//  AnimaWidget
//
//  패밀리별 SwiftUI 뷰. 홈(systemSmall/Medium)은 크림 카드 + 인디고 잉크 + 오렌지 강조로
//  Android 위젯과 통일. 잠금화면(accessory*)은 시스템이 단색 vibrant 로 렌더하므로 내용만 담는다.
//

import WidgetKit
import SwiftUI

// MARK: - 진입 뷰: 패밀리 분기

struct AnimaWidgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: AnimaEntry

    var body: some View {
        switch family {
        case .systemSmall:
            SmallHomeView(entry: entry)
        case .systemMedium:
            MediumHomeView(entry: entry)
        case .accessoryRectangular:
            LockRectangularView(entry: entry)
        case .accessoryInline:
            LockInlineView(entry: entry)
        case .accessoryCircular:
            LockCircularView(entry: entry)
        default:
            SmallHomeView(entry: entry)
        }
    }
}

// MARK: - 공통 컴포넌트

/// "Anima" 워드마크 — serif.
private struct Wordmark: View {
    var color: Color = WidgetTheme.ink
    var body: some View {
        Text("Anima")
            .font(.system(.subheadline, design: .serif))
            .fontWeight(.semibold)
            .foregroundColor(color)
    }
}

/// 진척 칩 "n / 3" — 완료 수. 전부 완료면 강조색.
private struct ProgressBadge: View {
    let progress: WidgetProgress
    var body: some View {
        let done = progress.doneCount
        Text("\(done) / \(WidgetProgress.total)")
            .font(.system(.caption2, design: .monospaced))
            .fontWeight(.medium)
            .foregroundColor(done == WidgetProgress.total ? WidgetTheme.accent : WidgetTheme.ink.opacity(WidgetTheme.dimOpacity))
    }
}

/// 스트릭 칩 "● n" — 0이면 숨김.
private struct StreakChip: View {
    let streak: Int
    var body: some View {
        if streak > 0 {
            HStack(spacing: 3) {
                Circle().fill(WidgetTheme.accent).frame(width: 5, height: 5)
                Text("STREAK \(streak)")
                    .font(.system(.caption2, design: .monospaced))
                    .fontWeight(.medium)
                    .foregroundColor(WidgetTheme.accent)
            }
        }
    }
}

/// 명언 본문 — serif italic.
private struct QuoteText: View {
    let text: String
    let lineLimit: Int
    let size: Font.TextStyle
    var body: some View {
        Text(text)
            .font(.system(size, design: .serif))
            .italic()
            .foregroundColor(WidgetTheme.ink)
            .lineLimit(lineLimit)
            .minimumScaleFactor(0.7)
            .multilineTextAlignment(.leading)
    }
}

/// 3가지 진척 체크 행(다짐·행동·잘한일).
private struct ProgressRow: View {
    let progress: WidgetProgress
    private let items: [(String, Bool)]

    init(progress: WidgetProgress) {
        self.progress = progress
        self.items = [
            ("다짐", progress.affirmation),
            ("행동", progress.actions),
            ("잘한 일", progress.wins),
        ]
    }

    var body: some View {
        HStack(spacing: 10) {
            ForEach(items, id: \.0) { label, done in
                HStack(spacing: 4) {
                    Image(systemName: done ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 11))
                        .foregroundColor(done ? WidgetTheme.accent : WidgetTheme.ink.opacity(WidgetTheme.todoOpacity))
                    Text(label)
                        .font(.system(.caption2, design: .monospaced))
                        .foregroundColor(WidgetTheme.ink.opacity(done ? WidgetTheme.dimOpacity : WidgetTheme.metaOpacity))
                        .strikethrough(done, color: WidgetTheme.ink.opacity(WidgetTheme.metaOpacity))
                }
            }
        }
    }
}

/// 빈 상태(캐시 없음) — 앱 실행 유도.
private struct EmptyContent: View {
    var compact: Bool = false
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Wordmark()
            Text(compact ? "앱을 열어\n오늘 카드를\n불러오세요" : "Anima 앱을 열어 오늘의 한 마디를 불러오세요")
                .font(.system(.footnote, design: .serif))
                .italic()
                .foregroundColor(WidgetTheme.ink.opacity(WidgetTheme.dimOpacity))
                .lineLimit(compact ? 3 : 2)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

// MARK: - 홈 위젯 (systemSmall)

private struct SmallHomeView: View {
    let entry: AnimaEntry
    var body: some View {
        Group {
            if let slot = entry.today?.primarySlot {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Wordmark()
                        Spacer()
                        ProgressBadge(progress: entry.today?.progress ?? .init(affirmation: false, actions: false, wins: false))
                    }
                    QuoteText(text: slot.text, lineLimit: 4, size: .subheadline)
                    Spacer(minLength: 0)
                    HStack {
                        Text(slot.author.uppercased())
                            .font(.system(.caption2, design: .monospaced))
                            .foregroundColor(WidgetTheme.ink.opacity(WidgetTheme.metaOpacity))
                            .lineLimit(1)
                        Spacer()
                        StreakChip(streak: entry.today?.streak ?? 0)
                    }
                }
            } else {
                EmptyContent(compact: true)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .containerBackgroundCream()
    }
}

// MARK: - 홈 위젯 (systemMedium)

private struct MediumHomeView: View {
    let entry: AnimaEntry
    var body: some View {
        Group {
            if let slot = entry.today?.primarySlot {
                let p = entry.today?.progress ?? .init(affirmation: false, actions: false, wins: false)
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Wordmark()
                        Spacer()
                        StreakChip(streak: entry.today?.streak ?? 0)
                        ProgressBadge(progress: p)
                    }
                    QuoteText(text: slot.text, lineLimit: 3, size: .body)
                    Text(slot.author.uppercased())
                        .font(.system(.caption2, design: .monospaced))
                        .foregroundColor(WidgetTheme.ink.opacity(WidgetTheme.metaOpacity))
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    Divider().background(WidgetTheme.ink.opacity(0.08))
                    ProgressRow(progress: p)
                }
            } else {
                EmptyContent(compact: false)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .containerBackgroundCream()
    }
}

// MARK: - 잠금화면 (accessoryRectangular)

private struct LockRectangularView: View {
    let entry: AnimaEntry
    var body: some View {
        if let slot = entry.today?.primarySlot {
            let p = entry.today?.progress ?? .init(affirmation: false, actions: false, wins: false)
            VStack(alignment: .leading, spacing: 2) {
                Text("ANIMA · \(p.doneCount)/\(WidgetProgress.total)")
                    .font(.system(.caption2, design: .monospaced))
                    .widgetAccentedTint()
                Text(slot.text)
                    .font(.system(.footnote, design: .serif))
                    .italic()
                    .lineLimit(2)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        } else {
            Text("Anima 앱 열기")
                .font(.system(.footnote, design: .serif))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        }
    }
}

// MARK: - 잠금화면 (accessoryInline)

private struct LockInlineView: View {
    let entry: AnimaEntry
    var body: some View {
        if let today = entry.today {
            let streakSuffix = today.streak > 0 ? " · 🔥\(today.streak)" : ""
            Text("✦ 오늘 \(today.progress.doneCount)/\(WidgetProgress.total)\(streakSuffix)")
        } else {
            Text("✦ Anima")
        }
    }
}

// MARK: - 잠금화면 (accessoryCircular) — 진척 게이지

private struct LockCircularView: View {
    let entry: AnimaEntry
    var body: some View {
        let done = entry.today?.progress.doneCount ?? 0
        Gauge(value: Double(done), in: 0...Double(WidgetProgress.total)) {
            Text("다짐")
        } currentValueLabel: {
            Text("\(done)")
        }
        .gaugeStyle(.accessoryCircularCapacity)
    }
}

// MARK: - 컨테이너 배경/틴트 헬퍼 (iOS 17+ containerBackground API 대응)

private extension View {
    /// 홈 위젯 크림 배경. iOS 17+ 는 containerBackground 필수.
    @ViewBuilder
    func containerBackgroundCream() -> some View {
        if #available(iOS 17.0, *) {
            self.padding(WidgetTheme.cardPadding)
                .containerBackground(WidgetTheme.cream, for: .widget)
        } else {
            self.padding(WidgetTheme.cardPadding)
                .background(WidgetTheme.cream)
        }
    }

    /// 잠금화면 accessory 에서 강조색 틴트(지원 시).
    @ViewBuilder
    func widgetAccentedTint() -> some View {
        if #available(iOS 16.0, *) {
            self.widgetAccentable()
        } else {
            self
        }
    }
}
