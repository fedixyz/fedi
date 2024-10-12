plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android") version "1.6.10"
    id("maven-publish")
    id("signing")
}

repositories {
    mavenCentral()
    google()
}

android {
    compileSdk = 31

    defaultConfig {
        minSdk = 21
        targetSdk = 31
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        consumerProguardFiles("consumer-rules.pro")
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            proguardFiles(file("proguard-android-optimize.txt"), file("proguard-rules.pro"))
        }
    }

    publishing {
        singleVariant("release") {
            withSourcesJar()
            withJavadocJar()
        }
    }
}

dependencies {
    implementation("net.java.dev.jna:jna:5.8.0@aar")
    implementation("org.jetbrains.kotlin:kotlin-stdlib-jdk7")
    implementation("androidx.appcompat:appcompat:1.4.0")
    implementation("androidx.core:core-ktx:1.7.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.4.1")
    api("org.slf4j:slf4j-api:1.7.30")

    androidTestImplementation("com.github.tony19:logback-android:2.0.0")
    androidTestImplementation("androidx.test.ext:junit:1.1.3")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.4.0")
    androidTestImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.4.1")
}

afterEvaluate {
    publishing {
        publications {
            create<MavenPublication>("maven") {
                groupId = "org.fedi"
                artifactId = "fedi-android"
                version = "0.1.2"

                from(components["release"])
                pom {
                    name.set("fedi-android")
                    description.set("Fedi Kotlin language bindings.")
                    url.set("https://fedi.xyz")
                }
            }
        }
        repositories {
            val androidBridgeArtifacts = System.getenv("ANDROID_BRIDGE_ARTIFACTS") ?: error("BRIDGE_ANDROID_ARTIFACTS environment variable must be set")
            maven {
                name = "fediAndroid"
                url = uri("file://$androidBridgeArtifacts")
            }
        }
    }
}