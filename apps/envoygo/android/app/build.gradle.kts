import java.io.FileInputStream
import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Play upload key — create android/key.properties (gitignored) + a .jks/.keystore.
// See apps/envoygo/store-release/googleplay/listing.md → Build & submit.
val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

android {
    namespace = "com.envoymesh.envoygo"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "com.envoymesh.envoygo"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            if (keystorePropertiesFile.exists()) {
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
                storePassword = keystoreProperties["storePassword"] as String
                // Relative storeFile paths are from android/ (key.properties location).
                storeFile = rootProject.file(keystoreProperties["storeFile"] as String)
            }
        }
    }

    buildTypes {
        release {
            // Prefer upload keystore when configured; otherwise debug so local
            // `flutter run --release` still works before Play signing is set up.
            signingConfig = if (keystorePropertiesFile.exists()) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

flutter {
    source = "../.."
}

// FCM / Firebase: apply only when google-services.json is present so local
// and CI builds still work before Firebase is configured. Place the file at:
//   apps/envoygo/android/app/google-services.json
// (package name must be com.envoymesh.envoygo)
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}
