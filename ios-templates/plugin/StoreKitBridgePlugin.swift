//
//  StoreKitBridgePlugin.swift
//  App (메인 앱 타깃)
//
//  WebView(JS) → 네이티브 StoreKit 2 브릿지. 인앱결제(평생 이용권)를 네이티브로 처리하고,
//  영수증(JWS)을 JS 로 돌려준다. JS 는 이를 /api/entitlement/verify-apple 에 보내 서버가
//  Apple StoreKit Server API 로 재검증하게 한 뒤, 검증이 끝나면 finishTransaction 으로 마무리한다.
//
//  설계 원칙:
//   - 클라이언트는 "결제를 띄우고 JWS 를 받는" 역할만. 권한 부여의 권위는 서버(verify-apple).
//   - finishTransaction 은 서버 검증 성공 후에만 호출한다 — 검증 전에 finish 하면 환불/위조
//     영수증을 거른 뒤에도 트랜잭션이 사라져 재처리가 불가능해진다.
//   - Transaction.updates 를 구독해 앱 외부(Ask to Buy 승인·다른 기기·중단된 결제)에서 도착하는
//     트랜잭션도 JS 로 통지한다(JS 가 동일 검증 경로로 봉합).
//
//  순수 Swift + CAPBridgedPlugin 자동 등록(Capacitor 6+). WidgetBridgePlugin 과 동일 패턴.
//  JS 사용: registerPlugin('StoreKitBridge') (lib/iosPurchase.ts)
//

import Foundation
import Capacitor
import StoreKit

@objc(StoreKitBridgePlugin)
public class StoreKitBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StoreKitBridgePlugin"
    public let jsName = "StoreKitBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishTransaction", returnType: CAPPluginReturnPromise),
    ]

    /// 사용자가 결제 시트를 닫음 — JS 가 에러 토스트 없이 조용히 처리하도록 구분되는 코드.
    private static let cancelledCode = "cancelled"
    /// 결제 승인 대기(Ask to Buy 등) — 즉시 권한을 주지 않고 후속 업데이트를 기다린다.
    private static let pendingCode = "pending"
    private static let unavailableMessage =
        "이 기기에서는 StoreKit 2(iOS 15+) 인앱결제를 사용할 수 없습니다."

    /// 앱 외부에서 도착하는 트랜잭션 구독 태스크.
    private var updatesTask: Task<Void, Never>?

    // MARK: - 생명주기

    public override func load() {
        if #available(iOS 15.0, *) {
            updatesTask = Task.detached { [weak self] in
                for await update in Transaction.updates {
                    await self?.notifyTransaction(update)
                }
            }
        }
    }

    deinit {
        updatesTask?.cancel()
    }

    @available(iOS 15.0, *)
    private func notifyTransaction(_ result: VerificationResult<Transaction>) async {
        // 서명 검증을 통과한 트랜잭션만 통지(위조 JWS 는 서버에서도 거르지만 1차 방어).
        guard case .verified(let transaction) = result else { return }
        notifyListeners("transactionUpdate", data: [
            "transactionId": String(transaction.id),
            "jws": result.jwsRepresentation,
            "productId": transaction.productID,
        ])
    }

    // MARK: - 상품 조회

    @objc func getProducts(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else { call.reject(Self.unavailableMessage); return }
        let ids = call.getArray("productIds", String.self) ?? []
        guard !ids.isEmpty else {
            call.reject("productIds 가 필요합니다.")
            return
        }
        Task {
            do {
                let products = try await Product.products(for: ids)
                let mapped: [[String: Any]] = products.map { p in
                    [
                        "id": p.id,
                        "displayName": p.displayName,
                        "description": p.description,
                        "displayPrice": p.displayPrice,
                    ]
                }
                call.resolve(["products": mapped])
            } catch {
                call.reject("상품 정보를 불러오지 못했습니다: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - 구매

    @objc func purchase(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else { call.reject(Self.unavailableMessage); return }
        guard let productId = call.getString("productId"), !productId.isEmpty else {
            call.reject("productId 가 필요합니다.")
            return
        }
        Task {
            do {
                let products = try await Product.products(for: [productId])
                guard let product = products.first else {
                    call.reject("상품을 찾을 수 없습니다: \(productId)")
                    return
                }
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        // 서버 검증 전이므로 finish 하지 않는다(검증 성공 후 finishTransaction).
                        call.resolve([
                            "transactionId": String(transaction.id),
                            "jws": verification.jwsRepresentation,
                            "productId": transaction.productID,
                        ])
                    case .unverified(_, let error):
                        call.reject("영수증 서명 검증 실패: \(error.localizedDescription)")
                    }
                case .userCancelled:
                    call.reject("사용자가 결제를 취소했습니다.", Self.cancelledCode)
                case .pending:
                    call.reject("결제가 보류 중입니다(승인 대기).", Self.pendingCode)
                @unknown default:
                    call.reject("알 수 없는 결제 결과입니다.")
                }
            } catch {
                call.reject("결제 처리 중 오류: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - 복원

    @objc func restore(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else { call.reject(Self.unavailableMessage); return }
        Task {
            // 사용자 인증 후 App Store 와 강제 동기화. 실패(취소 포함)해도 현재 권한으로 한 번 더 시도.
            do {
                try await AppStore.sync()
            } catch {
                // 무시하고 currentEntitlements 로 폴백.
            }
            var latest: (id: String, jws: String, productId: String)?
            for await result in Transaction.currentEntitlements {
                guard case .verified(let transaction) = result else { continue }
                if transaction.revocationDate != nil { continue } // 환불/취소분 제외.
                latest = (String(transaction.id), result.jwsRepresentation, transaction.productID)
            }
            if let found = latest {
                call.resolve([
                    "restored": true,
                    "transactionId": found.id,
                    "jws": found.jws,
                    "productId": found.productId,
                ])
            } else {
                call.resolve(["restored": false])
            }
        }
    }

    // MARK: - 트랜잭션 마무리(서버 검증 성공 후)

    @objc func finishTransaction(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else { call.reject(Self.unavailableMessage); return }
        guard let transactionId = call.getString("transactionId"), !transactionId.isEmpty else {
            call.reject("transactionId 가 필요합니다.")
            return
        }
        Task {
            for await result in Transaction.unfinished {
                guard case .verified(let transaction) = result else { continue }
                if String(transaction.id) == transactionId {
                    await transaction.finish()
                }
            }
            call.resolve()
        }
    }
}
