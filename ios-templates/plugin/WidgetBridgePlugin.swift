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
        guard let defaults = Self.sharedDefaults() else {
            // App Group 미구성(App 타깃 entitlement/포털 등록/프로비저닝 누락) — 조용히
            // 비공유 저장소로 떨어지면 위젯이 영영 빈 상태가 되므로, 명확한 사유로 reject 한다.
            call.reject(Self.appGroupErrorMessage)
            return
        }
        defaults.set(json, forKey: Self.todayKey)
        Self.reloadWidgets()
        call.resolve()
    }

    /// 로그아웃 등으로 캐시를 비우고 위젯을 빈 상태로 갱신한다.
    @objc func clearWidgetData(_ call: CAPPluginCall) {
        Self.sharedDefaults()?.removeObject(forKey: Self.todayKey)
        Self.reloadWidgets()
        call.resolve()
    }

    /// App Group 접근 불가 시 JS(Safari Web Inspector 콘솔)에 노출할 진단 메시지.
    private static let appGroupErrorMessage =
        "App Group(\(appGroupId)) 에 접근할 수 없습니다. " +
        "App 타깃에 App Groups capability 가 켜져 있고(Xcode > Signing & Capabilities), " +
        "Apple Developer 포털 App ID 에 등록돼 프로비저닝 프로파일에 포함됐는지 확인하세요."

    /// App Group 공유 UserDefaults. 컨테이너가 실제로 이 프로세스에 프로비저닝됐을 때만 반환.
    ///
    /// entitlement 가 빠지면 UserDefaults(suiteName:) 은 non-nil 이지만 위젯과 공유되지 않는
    /// 앱 전용 저장소로 떨어진다(침묵 실패). containerURL 은 entitlement/프로비저닝이 없으면
    /// nil 을 주므로, 이를 먼저 검사해 "공유 가능한 경우에만" 저장소를 반환한다.
    private static func sharedDefaults() -> UserDefaults? {
        guard FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupId) != nil
        else { return nil }
        return UserDefaults(suiteName: appGroupId)
    }

    private static func reloadWidgets() {
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
    }
}
