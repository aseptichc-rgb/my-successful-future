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
 *     영수증이 다른 Anima 계정에 묶여 있으면(서버 409) 결제 시트 없이 원 계정 로그인 안내로 종료
 *     — 그대로 진행하면 재구매(ITEM_ALREADY_OWNED)·복원(409) 모두 막히는 막다른 길이라서다.
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
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import com.google.firebase.auth.FirebaseAuth
import com.michaelkim.anima.data.auth.AuthRepository
import com.michaelkim.anima.data.auth.EntitlementRefreshResult
import com.michaelkim.anima.data.auth.EntitlementRepository
import com.michaelkim.anima.data.billing.BillingRepository
import com.michaelkim.anima.data.billing.ItemAlreadyOwnedException
import com.michaelkim.anima.util.CrashReporter
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

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
        // 웹이 함께 넘긴 세션 토큰. 네이티브가 미로그인이어도 이 토큰으로 같은 uid 로그인 후 진행한다.
        val bridgeToken = data.getQueryParameter("token")

        lifecycleScope.launch {
            try {
                if (!AuthRepository.isSignedIn) {
                    // 네이티브 미로그인 — 웹 세션 토큰이 있으면 같은 uid 로 로그인해 결제를 진행한다.
                    // (auth 브릿지가 아직 도달하지 못한 경우에도 결제가 막히지 않도록 하는 핵심 경로.)
                    val signedIn = signInWithBridgeToken(bridgeToken)
                    if (!signedIn) {
                        // 토큰이 없거나 로그인 실패 — 영수증을 uid 에 매달 수 없다. 사용자에게 사유를
                        // 알리고 종료(다음 앱 시작의 entitlement 복원에서 봉합됨).
                        Log.w(TAG, "네이티브 미로그인 — 결제 브릿지 건너뜀(token=${if (bridgeToken.isNullOrBlank()) "없음" else "있음"})")
                        if (!restoreOnly) toast(R.string.purchase_error_sign_in_required)
                        return@launch
                    }
                }

                // 1) 이미 보유 중인 영수증이 있으면 여기서 검증·권한 부여로 끝난다(복원 포함).
                val refresh = EntitlementRepository.refreshEntitlement(applicationContext)
                    .getOrDefault(EntitlementRefreshResult.NOT_ENTITLED)
                if (refresh == EntitlementRefreshResult.LINKED_TO_OTHER_ACCOUNT) {
                    // 기기 Play 계정의 영수증이 다른 Anima 계정에 묶여 있다 — 이대로 진행하면
                    // 재구매는 ITEM_ALREADY_OWNED, 복원은 서버 409 로 모두 막히는 막다른 길.
                    // 결제 시트를 띄우지 않고 유일한 해법(원 계정 로그인)을 바로 안내한다.
                    Log.w(TAG, "보유 영수증이 다른 계정에 연결됨(restoreOnly=$restoreOnly)")
                    toast(R.string.purchase_error_linked_other_account)
                    return@launch
                }
                val alreadyEntitled = refresh == EntitlementRefreshResult.ENTITLED
                if (alreadyEntitled || restoreOnly) {
                    Log.i(TAG, "보유 영수증 검증 완료(restoreOnly=$restoreOnly, entitled=$alreadyEntitled)")
                    return@launch
                }

                // 2) 미보유 → 상품 조회 후 결제 시트를 띄우고 결과를 기다린다.
                val details = BillingRepository.queryProductDetails(applicationContext).getOrElse {
                    CrashReporter.record(TAG, "상품 조회 실패", it)
                    toast(R.string.purchase_error_product_unavailable)
                    return@launch
                }
                val purchases = BillingRepository.launchBillingFlowAndAwait(this@PurchaseBridgeActivity, details)
                    .getOrElse {
                        if (it is ItemAlreadyOwnedException) {
                            // 위 refreshEntitlement 가 (네트워크 등으로) 보유 사실을 못 알아챈 채
                            // 내려온 경우 — 같은 계정이면 '구매 복원'으로 해소되고, 다른 계정이면
                            // 복원 시도에서 LINKED_TO_OTHER_ACCOUNT 안내가 뜬다. 재시도 안내는 오답.
                            Log.w(TAG, "결제 시트 거부 — 이미 보유 중(ITEM_ALREADY_OWNED)")
                            toast(R.string.purchase_error_already_owned)
                        } else {
                            CrashReporter.record(TAG, "결제 시트 실행 실패", it)
                            toast(R.string.purchase_error_launch_failed)
                        }
                        return@launch
                    }
                if (purchases.isEmpty()) {
                    // 사용자 취소 또는 콜백 유실 — 조용히 종료(취소는 안내하지 않는다).
                    Log.i(TAG, "결제 결과 없음(취소 추정)")
                    return@launch
                }

                // 3) 결제 직후 검증 — acknowledge + 서버 검증 + 네이티브 paid claim 적용.
                val verified = EntitlementRepository.refreshEntitlement(applicationContext)
                    .getOrDefault(EntitlementRefreshResult.NOT_ENTITLED)
                Log.i(TAG, "결제 후 entitlement 검증 결과 $verified")
                when (verified) {
                    EntitlementRefreshResult.ENTITLED -> Unit
                    // 방금 결제한 영수증이 다른 계정에 묶여 있는 극단 케이스도 사유는 정확히.
                    EntitlementRefreshResult.LINKED_TO_OTHER_ACCOUNT ->
                        toast(R.string.purchase_error_linked_other_account)
                    EntitlementRefreshResult.NOT_ENTITLED ->
                        toast(R.string.purchase_error_verify_failed)
                }
            } catch (e: Exception) {
                CrashReporter.record(TAG, "결제 브릿지 처리 실패", e)
                toast(R.string.purchase_error_generic)
            } finally {
                finish()
            }
        }
    }

    /**
     * 웹 세션 토큰으로 네이티브 FirebaseAuth 로그인. 토큰이 없거나 실패하면 false.
     * 실패해도 throw 하지 않는다 — 호출부가 false 로 분기해 사용자에게 안내한다.
     */
    private suspend fun signInWithBridgeToken(token: String?): Boolean {
        if (token.isNullOrBlank()) return false
        return try {
            FirebaseAuth.getInstance().signInWithCustomToken(token).await()
            AuthRepository.isSignedIn
        } catch (e: Exception) {
            CrashReporter.record(TAG, "결제 브릿지 토큰 로그인 실패", e)
            false
        }
    }

    /** 결제 실패 사유를 사용자에게 Toast 로 안내. 코루틴이 Main 디스패처에서 돌므로 그대로 호출 가능. */
    private fun toast(messageResId: Int) {
        try {
            Toast.makeText(applicationContext, getString(messageResId), Toast.LENGTH_LONG).show()
        } catch (e: Exception) {
            // Toast 표시 실패가 결제 흐름을 깨면 안 된다 — 무시.
            Log.w(TAG, "Toast 표시 실패", e)
        }
    }

    companion object {
        private const val TAG = "PurchaseBridge"
    }
}
