//
//  WidgetBridgePlugin.swift
//  App (메인 앱 타깃)
//
//  WebView(JS) → 네이티브 브릿지. /api/widget/today 응답 JSON 을 App Group 공유
//  UserDefaults 에 쓰고 WidgetKit 타임라인을 리로드한다. 위젯 익스텐션은 이 캐시만 읽는다.
//
//  순수 Swift + CAPBridgedPlugin 자동 등록(Capacitor 6+). ObjC 매크로/브리징 헤더 불필요 —
//  Capacitor 런타임이 CAPPlugin 서브클래스를 ObjC 런타임으로 스캔해 jsName 으로 등록한다.
//
//  JS 사용: const WidgetBridge = registerPlugin('WidgetBridge'); (lib/iosWidget.ts)
//

import Foundation
import Capacitor
import WidgetKit

@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setWidgetData", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearWidgetData", returnType: CAPPluginReturnPromise),
    ]

    /// 메인 앱 ↔ 위젯 공유 키. AnimaWidget 의 WidgetStore 와 반드시 동일.
    private static let appGroupId = "group.com.michaelkim.anima"
    private static let todayKey = "widget_today_json"

    /// /api/widget/today 응답 JSON 문자열을 공유 저장소에 기록하고 위젯을 갱신한다.
    @objc func setWidgetData(_ call: CAPPluginCall) {
        guard let json = call.getString("json"), !json.isEmpty else {
            call.reject("json 파라미터가 필요합니다.")
            return
        }
        guard let defaults = UserDefaults(suiteName: Self.appGroupId) else {
            // App Group 미구성(entitlement/포털 누락) — 조용히 실패시키되 사유를 알린다.
            call.reject("App Group(\(Self.appGroupId)) 에 접근할 수 없습니다.")
            return
        }
        defaults.set(json, forKey: Self.todayKey)
        Self.reloadWidgets()
        call.resolve()
    }

    /// 로그아웃 등으로 캐시를 비우고 위젯을 빈 상태로 갱신한다.
    @objc func clearWidgetData(_ call: CAPPluginCall) {
        if let defaults = UserDefaults(suiteName: Self.appGroupId) {
            defaults.removeObject(forKey: Self.todayKey)
        }
        Self.reloadWidgets()
        call.resolve()
    }

    private static func reloadWidgets() {
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
    }
}
