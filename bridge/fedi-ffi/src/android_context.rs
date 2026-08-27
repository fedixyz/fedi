//! Publishes Android's `JavaVM` and `Context` for `ndk-context` to hand out.
//!
//! Three crates in the graph read the device's network configuration through
//! the Android NDK — `hickory-resolver` (system DNS), `iroh-dns` and `netdev`
//! (interface enumeration) — and each reaches it via
//! `ndk_context::android_context()`. That call panics with "android context was
//! not initialized" unless something published the VM and Context first.
//!
//! An app built around `ndk-glue` or `android-activity` gets that for free. The
//! bridge is a plain JNI library that React Native loads, so it has no such
//! entry point and nothing ever did it. The first real Android device therefore
//! panicked inside iroh's DNS resolver during the FMan availability probe.
//! iOS never takes this path — it reads `/etc/resolv.conf` — which is why
//! simulator testing could not have caught it.
//!
//! The panic was recovered (hickory catches it and iroh falls back to Google's
//! DNS servers), so it read as noise rather than a crash. Publishing the
//! context restores the device's own resolver and disarms the same panic in the
//! other two crates before they reach it.

use std::ffi::c_void;
use std::sync::Once;

use jni::JNIEnv;
use jni::objects::JObject;
use tracing::{error, info};

static INIT: Once = Once::new();

/// Called by `FedimintFfiModule` before any bridge RPC can run.
///
/// # Safety
/// Invoked by the JVM through JNI. The name must stay in step with the Kotlin
/// `external fun` on `com.fedi.FedimintFfiModule`, or the JVM raises
/// `UnsatisfiedLinkError` at call time rather than at build time.
#[no_mangle]
pub extern "system" fn Java_com_fedi_FedimintFfiModule_nativeInitAndroidContext(
    mut env: JNIEnv,
    _this: JObject,
    context: JObject,
) {
    // `Once` rather than a plain call: React Native can rebuild a native module
    // (a dev reload, say), and initializing twice would strand the first global
    // reference with no way to release it.
    INIT.call_once(|| {
        let vm = match env.get_java_vm() {
            Ok(vm) => vm,
            Err(err) => {
                error!(?err, "could not read the JavaVM; leaving ndk-context unset");
                return;
            }
        };
        // The Context has to outlive every later `android_context()` read, so it
        // is held as a global reference and deliberately never dropped — the
        // process owns it for its whole life.
        let context = match env.new_global_ref(context) {
            Ok(context) => context,
            Err(err) => {
                error!(
                    ?err,
                    "could not pin the Android Context; leaving ndk-context unset"
                );
                return;
            }
        };
        let context_ptr = context.as_raw() as *mut c_void;
        std::mem::forget(context);

        // SAFETY: both pointers come from a live JVM on the calling thread. The
        // Context is a global reference that is never released, so it stays
        // valid for every read `ndk-context` serves.
        unsafe {
            ndk_context::initialize_android_context(
                vm.get_java_vm_pointer() as *mut c_void,
                context_ptr,
            );
        }
        info!("android context published to ndk-context");
    });
}
