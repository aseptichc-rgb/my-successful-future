//
//  AnimaWidgetBundle.swift
//  AnimaWidget
//
//  위젯 익스텐션 진입점(@main). 홈(small/medium) + 잠금화면(rectangular/inline/circular)을
//  한 정의로 지원한다 — supportedFamilies 로 패밀리를 선언.
//

import WidgetKit
import SwiftUI

@main
struct AnimaWidgetBundle: WidgetBundle {
    var body: some Widget {
        AnimaWidget()
    }
}

struct AnimaWidget: Widget {
    /// 위젯 식별자 — 갤러리/시스템에서 이 위젯을 구분하는 kind.
    static let kind = "AnimaWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Self.kind, provider: AnimaProvider()) { entry in
            AnimaWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Anima 오늘의 한 마디")
        .description("오늘의 동기부여 한 마디와 다짐·행동·잘한 일 진척을 보여줍니다.")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .accessoryRectangular,
            .accessoryInline,
            .accessoryCircular,
        ])
    }
}
