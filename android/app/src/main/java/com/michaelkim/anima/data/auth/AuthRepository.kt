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
import androidx.credentials.exceptions.GetCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import com.michaelkim.anima.BuildConfig
import kotlinx.coroutines.tasks.await

object AuthRepository {

    val currentUser: FirebaseUser?
        get() = FirebaseAuth.getInstance().currentUser

    val isSignedIn: Boolean
        get() = currentUser != null

    /**
     * 현재 사용자의 Firebase ID 토큰을 반환. 사용자 없으면 null.
     * forceRefresh=true 면 항상 새 토큰 발급 (만료 임박 시).
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
                return Result.failure(IllegalStateException("Google 자격증명이 아닙니다."))
            }
            val googleIdToken = try {
                GoogleIdTokenCredential.createFrom(credential.data).idToken
            } catch (e: GoogleIdTokenParsingException) {
                return Result.failure(e)
            }
            val firebaseCredential = GoogleAuthProvider.getCredential(googleIdToken, null)
            val authResult = FirebaseAuth.getInstance()
                .signInWithCredential(firebaseCredential)
                .await()
            val user = authResult.user
                ?: return Result.failure(IllegalStateException("Firebase 사용자 정보 없음"))
            Result.success(user)
        } catch (e: GetCredentialException) {
            Result.failure(e)
        } catch (e: Exception) {
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
