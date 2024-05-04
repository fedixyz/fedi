buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:7.1.2")
    }
}

// plugins {
//     id("io.github.gradle-nexus.publish-plugin") version "1.1.0"
// }

// These properties are required here so that the nexus publish-plugin
// finds a staging profile with the correct group (group is otherwise set as "")
// and knows whether to publish to a SNAPSHOT repository or not
// https://github.com/gradle-nexus/publish-plugin#applying-the-plugin
group = "org.fedi"
version = "0.1.2"

// nexusPublishing {
//     repositories {
//         create("sonatype") {
//             nexusUrl.set(uri("https://s01.oss.sonatype.org/service/local/"))
//             snapshotRepositoryUrl.set(uri("https://s01.oss.sonatype.org/content/repositories/snapshots/"))
//
//             val ossrhUsername: String? by project
//             val ossrhPassword: String? by project
//             username.set(ossrhUsername)
//             password.set(ossrhPassword)
//         }
//     }
// }
