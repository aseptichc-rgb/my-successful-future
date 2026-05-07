/**
 * Firebase Auth 래퍼 — 위젯/Worker/UI 어디서든 같은 진입점으로 호출.
 *
 * 인증 모드: Google ID Token (Credential Manager) → FirebaseAuth signInWithCredential.
 * 별도 토큰 캐시는 두지 않는다 — Firebase SDK 가 idToken refresh 와 디스크 영속화를 모두 처리.
 *
 * 보안: 평문 토큰을 DataStore 등에 저장하지 않는다. 매 호출마다 SDK 에서 발급받음.
 */
package com.michaelkim.anima.data.auth

import android.content.Context
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import android.util.Log
import androidx.credentials.exceptions.GetCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthException
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import com.michaelkim.anima.BuildConfig
import kotlinx.coroutines.tasks.await

object AuthRepository {

    private const val TAG = "AuthRepository"

    val currentUser: FirebaseUser?
        get() = FirebaseAuth.getInstance().currentUser

    val isSignedIn: Boolean
        get() = currentUser != null

    /**
     * 현재 사용자의 Firebase ID 토큰을 반환. 사용자 없으면 null.
     * forceRefresh=true 면 항상 새 토큰 발급 (만료 임박 시 / 결제 직후 새 claim 반영 시).
     */
    suspend fun currentIdToken(forceRefresh: Boolean = false): String? {
        val user = currentUser ?: return null
        return try {
            user.getIdToken(forceRefresh).await().token
        } catch (e: Exception) {
            null
        }
    }

    /**
     * 현재 ID 토큰의 claim 에 paid=true 가 박혀 있는지.
     * /api/entitlement/verify 가 setCustomUserClaims 로 설정하면 다음 토큰부터 true 가 됨.
     */
    suspend fun isPaid(forceRefresh: Boolean = false): Boolean {
        val user = currentUser ?: return false
        return try {
            val result = user.getIdToken(forceRefresh).await()
            result.claims["paid"] == true
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Google Sign-In → Firebase Auth.
     * 호출자: UI Activity (Credential Manager 가 Activity Context 필요).
     */
    suspend fun signInWithGoogle(activityContext: Context): Result<FirebaseUser> {
        val webClientId = BuildConfig.GOOGLE_WEB_CLIENT_ID
        if (webClientId.isBlank()) {
            return Result.failure(IllegalStateException("GOOGLE_WEB_CLIENT_ID 미설정 — local.properties 확인"))
        }
        return try {
            val credentialManager = CredentialManager.create(activityContext)
            val googleIdOption = GetGoogleIdOption.Builder()
                .setFilterByAuthorizedAccounts(false)
                .setServerClientId(webClientId)
                .setAutoSelectEnabled(true)
                .build()
            val request = GetCredentialRequest.Builder()
                .addCredentialOption(googleIdOption)
                .build()
            val response = credentialManager.getCredential(activityContext, request)
            val credential = response.credential
            if (credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                Log.e(TAG, "Unexpected credential type: ${credential.type}")
                return Result.failure(IllegalStateException("Google 자격증명이 아닙니다 (type=${credential.type})"))
            }
            val googleIdToken = try {
                GoogleIdTokenCredential.createFrom(credential.data).idToken
            } catch (e: GoogleIdTokenParsingException) {
                Log.e(TAG, "Google ID token parsing failed", e)
                return Result.failure(IllegalStateException("Google ID 토큰 파싱 실패: ${e.message}", e))
            }
            val firebaseCredential = GoogleAuthProvider.getCredential(googleIdToken, null)
            val authResult = try {
                FirebaseAuth.getInstance().signInWithCredential(firebaseCredential).await()
            } catch (e: FirebaseAuthException) {
                Log.e(TAG, "Firebase signInWithCredential failed: code=${e.errorCode}", e)
                return Result.failure(
                    IllegalStateException(
                        "Firebase 인증 실패 [${e.errorCode}] ${e.message ?: ""} — Firebase Console > Authentication > Sign-in method 에서 Google provider 가 활성화돼 있는지 확인하세요.",
                        e,
                    ),
                )
            }
            val user = authResult.user
                ?: return Result.failure(IllegalStateException("Firebase 사용자 정보 없음"))
            Log.i(TAG, "Google sign-in success: uid=${user.uid}")
            Result.success(user)
        } catch (e: GetCredentialException) {
            // Credential Manager 가 토큰 발급 자체를 거부한 경우.
            // 가장 흔한 원인:
            //  1) Google Cloud OAuth consent screen 이 Testing 상태인데 현재 계정이 test users 미등록
            //  2) 기기 Play Services 구버전
            //  3) 기기에 Google 계정이 없음 (NoCredentialException)
            Log.e(TAG, "GetCredentialException: type=${e.type} message=${e.message}", e)
            Result.failure(
                IllegalStateException(
                    "Google 자격증명 발급 실패 [${e.type}] ${e.message ?: ""}",
                    e,
                ),
            )
        } catch (e: Exception) {
            Log.e(TAG, "Unexpected sign-in error", e)
            Result.failure(e)
        }
    }

    suspend fun signOut(context: Context) {
        try {
            FirebaseAuth.getInstance().signOut()
            // Credential Manager 의 자동 로그인 캐시도 비움
            CredentialManager.create(context)
                .clearCredentialState(ClearCredentialStateRequest())
        } catch (_: Exception) {
            // 로컬 정리 실패는 치명적이지 않음
        }
    }
}
