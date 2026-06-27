/**
 * 웹(TWA) → 네이티브 Play Billing 결제 브릿지.
 *
 * 왜 별도 액티비티인가:
 *  - TWA 의 웹 Digital Goods API / PaymentRequest 위임 경로는 Android 13+ 에서 Chrome 이
 *    DelegationService 에 바인딩하지 못해 `clientAppUnavailable` 로 깨진다(검증·assetlinks·
 *    결제프로필 정상이어도). 그래서 결제만 웹 위임 대신 네이티브 BillingClient 로 직접 처리한다.
 *  - 결제 시트(Play UI)는 이 액티비티 위로 떠야 하므로 NoDisplay 가 아닌 Translucent 테마를 쓰고,
 *    결제 시트가 닫혀 콜백이 올 때까지 살아 있어야 하므로 noHistory 도 쓰지 않는다.
 *
 * 동작:
 *  - anima://purchase            : 구매. 이미 보유 중이면(복원 케이스) 결제 시트 없이 검증만.
 *  - anima://purchase?mode=restore : 결제 시트 없이 보유 영수증 검증(복원)만.
 *  1) EntitlementRepository.refreshEntitlement — 보유 영수증을 서버 검증(이미 샀으면 여기서 끝).
 *  2) 미보유 + 구매 모드면 queryProductDetails → launchBillingFlowAndAwait → 다시 검증.
 *  3) 성공 시 서버가 paid claim 을 박았으므로, 웹 TWA 는 이 액티비티가 닫혀 복귀하면
 *     getIdToken(true) 강제 갱신으로 paid 를 즉시 반영한다(별도 토큰 전달 불필요 — 같은 uid).
 *
 * 보안/안정성:
 *  - 결제 검증은 서버(/api/entitlement/verify)가 Google Play Developer API 로 재확인 — 위조 차단.
 *  - 네이티브 미로그인 등 어떤 실패도 throw 하지 않고 조용히 finish — 웹 흐름을 막지 않는다.
 */
package com.michaelkim.anima

import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import com.michaelkim.anima.data.auth.AuthRepository
import com.michaelkim.anima.data.auth.EntitlementRepository
import com.michaelkim.anima.data.billing.BillingRepository
import com.michaelkim.anima.util.CrashReporter
import kotlinx.coroutines.launch

class PurchaseBridgeActivity : ComponentActivity() {

    // 결제 시트가 떴다 돌아오며 onResume 가 다시 호출돼도 결제를 중복 실행하지 않도록 1회 가드.
    @Volatile
    private var handled = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handle(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handle(intent)
    }

    private fun handle(intent: Intent?) {
        val data = intent?.data
        if (data == null || data.scheme != "anima" || data.host != "purchase") {
            finish()
            return
        }
        if (handled) return
        handled = true

        val restoreOnly = data.getQueryParameter("mode") == "restore"

        lifecycleScope.launch {
            try {
                if (!AuthRepository.isSignedIn) {
                    // 네이티브 미로그인 — 영수증을 uid 에 매달 수 없다. 다음 앱 시작의 entitlement
                    // 복원에서 봉합되므로 여기선 조용히 종료(웹은 변화 없음).
                    Log.w(TAG, "네이티브 미로그인 — 결제 브릿지 건너뜀")
                    return@launch
                }

                // 1) 이미 보유 중인 영수증이 있으면 여기서 검증·권한 부여로 끝난다(복원 포함).
                val alreadyEntitled = EntitlementRepository.refreshEntitlement(applicationContext)
                    .getOrDefault(false)
                if (alreadyEntitled || restoreOnly) {
                    Log.i(TAG, "보유 영수증 검증 완료(restoreOnly=$restoreOnly, entitled=$alreadyEntitled)")
                    return@launch
                }

                // 2) 미보유 → 상품 조회 후 결제 시트를 띄우고 결과를 기다린다.
                val details = BillingRepository.queryProductDetails(applicationContext).getOrElse {
                    CrashReporter.record(TAG, "상품 조회 실패", it)
                    return@launch
                }
                val purchases = BillingRepository.launchBillingFlowAndAwait(this@PurchaseBridgeActivity, details)
                    .getOrElse {
                        CrashReporter.record(TAG, "결제 시트 실행 실패", it)
                        return@launch
                    }
                if (purchases.isEmpty()) {
                    // 사용자 취소 또는 콜백 유실 — 조용히 종료.
                    Log.i(TAG, "결제 결과 없음(취소 추정)")
                    return@launch
                }

                // 3) 결제 직후 검증 — acknowledge + 서버 검증 + 네이티브 paid claim 적용.
                val ok = EntitlementRepository.refreshEntitlement(applicationContext).getOrDefault(false)
                Log.i(TAG, "결제 후 entitlement 검증 결과 ok=$ok")
            } catch (e: Exception) {
                CrashReporter.record(TAG, "결제 브릿지 처리 실패", e)
            } finally {
                finish()
            }
        }
    }

    companion object {
        private const val TAG = "PurchaseBridge"
    }
}
