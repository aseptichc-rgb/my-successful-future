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
