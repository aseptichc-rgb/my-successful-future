# kotlinx.serialization 보존
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keep,includedescriptorclasses class com.michaelkim.anima.**$$serializer { *; }
-keepclassmembers class com.michaelkim.anima.** {
    *** Companion;
}
-keepclasseswithmembers class com.michaelkim.anima.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# OkHttp / Retrofit
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn retrofit2.**

# TWA (androidbrowserhelper) — DelegationService/알림 위임의 AIDL 바인딩 경로가 R8 축소/난독화로
#  제거·리네임되지 않도록 보존한다. (Play Billing 위임은 제거됐고, 결제는 네이티브 BillingClient 가 전담.)
-keep class com.google.androidbrowserhelper.** { *; }
-dontwarn com.google.androidbrowserhelper.**
# Play Billing — 네이티브 BillingClient(결제·복원·승인) 경로 보존.
-keep class com.android.billingclient.** { *; }
-keep class com.android.vending.billing.** { *; }
