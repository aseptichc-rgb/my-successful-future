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

# TWA Play Billing 위임 (androidbrowserhelper + Play BillingClient)
#  release 의 R8 축소/난독화가 Digital Goods 명령 라우팅(getDetails/listPurchases/acknowledge)
#  이나 PaymentActivity/PaymentService/DelegationService 의 내부 클래스·메서드를 제거·리네임하면
#  Chrome 이 위임을 실행하지 못해 getDetails 가 깨지고 결제가 clientAppUnavailable 로 떨어진다.
#  매니페스트 참조 클래스는 R8 이 자동 보존하지만, 라이브러리 내부/AIDL 바인딩 경로까지
#  안전하게 통째로 보존해 결제 위임 전 구간을 깨지지 않게 한다.
-keep class com.google.androidbrowserhelper.** { *; }
-dontwarn com.google.androidbrowserhelper.**
-keep class com.android.billingclient.** { *; }
-keep class com.android.vending.billing.** { *; }
