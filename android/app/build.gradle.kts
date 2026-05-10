import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.google.services)
}

// 로컬 환경의 API 베이스 URL.
// android/local.properties 에:
//   ANIMA_API_BASE_URL=https://your-deployed-anima.vercel.app
//   ANIMA_GOOGLE_WEB_CLIENT_ID=xxxxx.apps.googleusercontent.com
// 형태로 설정. 누락되면 로컬 개발용 기본값 사용.
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
val animaApiBaseUrl: String = localProps.getProperty("ANIMA_API_BASE_URL")
    ?: System.getenv("ANIMA_API_BASE_URL")
    ?: "http://10.0.2.2:3000"
val googleWebClientId: String = localProps.getProperty("ANIMA_GOOGLE_WEB_CLIENT_ID")
    ?: System.getenv("ANIMA_GOOGLE_WEB_CLIENT_ID")
    ?: ""
// Play Console > 인앱 상품에서 만든 결제 상품 ID. 서버의 ANDROID_LIFETIME_PRODUCT_ID 와 일치해야 함.
val animaLifetimeProductId: String = localProps.getProperty("ANIMA_LIFETIME_PRODUCT_ID")
    ?: System.getenv("ANIMA_LIFETIME_PRODUCT_ID")
    ?: "anima_lifetime"

android {
    namespace = "com.michaelkim.anima"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.michaelkim.anima"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        buildConfigField("String", "ANIMA_API_BASE_URL", "\"$animaApiBaseUrl\"")
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"$googleWebClientId\"")
        buildConfigField("String", "LIFETIME_PRODUCT_ID", "\"$animaLifetimeProductId\"")
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)

    // Compose
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    debugImplementation(libs.androidx.compose.ui.tooling)

    // Glance
    implementation(libs.androidx.glance.appwidget)
    implementation(libs.androidx.glance.material3)

    // WorkManager
    implementation(libs.androidx.work.runtime.ktx)

    // DataStore
    implementation(libs.androidx.datastore.preferences)

    // Networking
    implementation(libs.retrofit)
    implementation(libs.retrofit.kotlinx.serialization)
    implementation(libs.okhttp.logging)
    implementation(libs.kotlinx.serialization.json)

    // Coroutines
    implementation(libs.kotlinx.coroutines.android)

    // Firebase
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.auth.ktx)
    implementation(libs.firebase.analytics.ktx)

    // Credential Manager (Google Sign-In)
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services)
    implementation(libs.google.id)

    // Play Billing (1회 결제 영수증)
    implementation(libs.billing.ktx)

    // Play Integrity (호출자 정품 검증 → 서버에서 영수증 위조 차단)
    implementation(libs.play.integrity)

    // Trusted Web Activity — 웹앱을 주소창 없이 전체화면으로 띄우기 위함
    implementation(libs.androidbrowserhelper)
}
