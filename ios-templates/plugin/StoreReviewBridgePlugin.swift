//
//  StoreReviewBridgePlugin.swift
//  App (메인 앱 타깃)
//
//  WebView(JS) → 네이티브 App Store 평가 요청 브릿지. 7일 해금 뒤 웹 리뷰 카드
//  (components/home/StoreReviewCard)의 [리뷰 남기기] 가 부른다.
//
//  시스템 평가 시트를 "요청" 만 한다 — 실제 표시 여부는 iOS 가 정한다(365일 3회 제한 등).
//  그래서 표시되지 않아도 resolve 하며, JS 도 결과를 성공/실패로 해석하지 않는다.
//  활성 포그라운드 씬이 없어 요청 자체가 불가능할 때만 reject 한다 — JS 는 그 경우
//  App Store 리뷰 작성 페이지(write-review 딥링크)로 폴백한다(lib/storeReviewBridge.ts).
//
//  ⚠️ 새 파일 — 기존 플러그인과 달리 Xcode 의 App 타깃에 아직 등록돼 있지 않다. Mac 에서
//     ios/App/App/ 로 복사한 뒤 Xcode 에서 App 타깃 멤버십을 켜야 바이너리에 포함된다
//     (RESUBMIT-IOS.md 참고). 플러그인이 없는 구 바이너리에서는 JS 폴백이 동작한다.
//
//  순수 Swift + CAPBridgedPlugin 자동 등록(Capacitor 6+) — WidgetBridgePlugin 과 동일 패턴.
//  JS 사용: registerPlugin('StoreReviewBridge') (lib/storeReviewBridge.ts)
//

import Foundation
import Capacitor
import StoreKit

@objc(StoreReviewBridgePlugin)
public class StoreReviewBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StoreReviewBridgePlugin"
    public let jsName = "StoreReviewBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestReview", returnType: CAPPluginReturnPromise),
    ]

    /// 시스템 평가 시트를 요청한다. 반드시 메인 스레드에서, 활성 포그라운드 씬에 붙여 부른다 —
    /// 씬 없이 부르면 iOS 가 조용히 무시하므로 그 경우는 reject 로 JS 폴백을 살린다.
    @objc func requestReview(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let scene = Self.activeWindowScene() else {
                call.reject("활성 화면이 없어 평가 요청을 띄울 수 없습니다.")
                return
            }
            if #available(iOS 16.0, *) {
                AppStore.requestReview(in: scene)
            } else {
                SKStoreReviewController.requestReview(in: scene)
            }
            call.resolve()
        }
    }

    private static func activeWindowScene() -> UIWindowScene? {
        return UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
    }
}
