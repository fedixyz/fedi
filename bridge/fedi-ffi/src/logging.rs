// Stop complaining about unused variables due to cfg macros
#![allow(unused)]
use std::collections::BTreeMap;
use std::ffi::OsStr;
use std::fs::{File, OpenOptions};
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::{Arc, Mutex, Once};
use std::{io, thread};

use anyhow::Context;
use fedimint_logging::{LOG_CLIENT, LOG_CLIENT_MODULE_WALLET, LOG_CLIENT_REACTOR};
use rpc_types::event::{Event, EventSink, TypedEventExt};
use rpc_types::RpcAppFlavor;
use tracing::metadata::LevelFilter;
use tracing_serde::AsSerde;
use tracing_subscriber::layer::SubscriberExt;
// nosemgrep: ban-wildcard-imports
use tracing_subscriber::prelude::*;
use tracing_subscriber::{EnvFilter, Layer};

// Logs stay in one file per UTC day so we avoid a stream of tiny files while
// still rotating often enough for cleanup and upload workflows.
const RAW_LOG_PREFIX: &str = "fedi.log.";
const COMPRESSED_LOG_PREFIX: &str = "fedi.logz.";
const LEGACY_LOG_FILE_NAME: &str = "fedi.log";
const LEGACY_MIGRATION_UNIXDAY: u64 = 10;
const SECONDS_PER_DAY: u64 = 86_400;

fn permissive_log_filter() -> String {
    format!(
        "info,{LOG_CLIENT}=debug,fediffi=trace,{LOG_CLIENT_REACTOR}=trace,{LOG_CLIENT_MODULE_WALLET}=trace"
    )
}

fn strict_log_filter() -> String {
    format!(
        "info,{LOG_CLIENT}=warn,{LOG_CLIENT_REACTOR}=off,{LOG_CLIENT_MODULE_WALLET}=warn,matrix_sdk_crypto=error,fedimint_ln_client::pay=error,fediffi=info"
    )
}

fn default_log_filter(app_flavor: RpcAppFlavor) -> String {
    match app_flavor {
        RpcAppFlavor::Dev | RpcAppFlavor::Nightly | RpcAppFlavor::Tests => permissive_log_filter(),
        RpcAppFlavor::Bravo => strict_log_filter(),
    }
}

pub struct ReactNativeLayer(pub EventSink);

impl<S> Layer<S> for ReactNativeLayer
where
    S: tracing::Subscriber,
{
    fn on_event(
        &self,
        event: &tracing::Event<'_>,
        _ctx: tracing_subscriber::layer::Context<'_, S>,
    ) {
        if let Ok(event) = serde_json::to_string(&event.as_serde()) {
            self.0.typed_event(&Event::log(event));
        }
    }
}

// TODO: configurable log level
pub fn init_logging(
    data_dir: &Path,
    event_sink: EventSink,
    log_filter: &str,
    app_flavor: RpcAppFlavor,
) -> anyhow::Result<()> {
    // running tests on a mac
    #[cfg(test)]
    return init_logging_test();

    let current_unixday = unixday_now()?;
    let log_file_path = data_dir.join(format!("{RAW_LOG_PREFIX}{current_unixday}"));
    let log_file_writer = OpenOptions::new()
        .append(true)
        .create(true)
        .open(&log_file_path)
        .with_context(|| format!("failed to open active log file {}", log_file_path.display()))?;

    spawn_log_maintenance_thread(data_dir.to_path_buf(), current_unixday, app_flavor)
        .expect("failed to spawn log maintenance thread");

    let log_file_layer = tracing_subscriber::fmt::layer()
        .json()
        .with_writer(Mutex::new(log_file_writer));

    let reg = tracing_subscriber::registry();

    #[cfg(debug_assertions)]
    let reg = reg.with(
        ReactNativeLayer(event_sink)
            .with_filter(EnvFilter::from_str(log_filter).unwrap_or_default()),
    );

    let reg = reg.with(log_file_layer.with_filter(EnvFilter::new(default_log_filter(app_flavor))));

    let res = if cfg!(target_os = "android") && option_env!("FEDI_DEV_LOGS").is_some() {
        let time = fedimint_core::time::duration_since_epoch().as_secs();
        reg.with(
            tracing_subscriber::fmt::layer()
                .with_ansi(true)
                .pretty()
                // using time because we can't overwrite existing files in Download
                // nosemgrep: ban-file-create
                .with_writer(Mutex::new(std::fs::File::create(format!(
                    "/storage/emulated/0/Download/fedi-{time}.log",
                ))?))
                .with_filter(EnvFilter::from_str(log_filter).unwrap_or_default()),
        )
        .try_init()
    } else {
        reg.try_init()
    };
    res.unwrap_or_else(|error| tracing::info!("Error installing logger: {}", error));

    // #[cfg(target_os = "ios")]
    // use tracing_subscriber::{layer::SubscriberExt, prelude::*, Layer};
    // #[cfg(target_os = "ios")]
    // tracing_subscriber::registry()
    //     .with(
    //         tracing_oslog::OsLogger::new(
    //             "com.justinmoon.fluttermint",
    //             "INFO", // I don't know what this does ...
    //         )
    //         .with_filter(tracing_subscriber::filter::LevelFilter::INFO),
    //     )
    //     .try_init()
    //     .unwrap_or_else(|error| tracing::info!("Error installing logger: {}",
    // error));

    Ok(())
}

fn init_logging_test() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .try_init()
        .unwrap_or_else(|error| tracing::info!("Error installing logger: {}", error));

    Ok(())
}

fn unixday_now() -> anyhow::Result<u64> {
    Ok(fedimint_core::time::duration_since_epoch().as_secs() / SECONDS_PER_DAY)
}

fn max_compressed_log_files(app_flavor: RpcAppFlavor) -> usize {
    match app_flavor {
        // Keep nightly retention intentionally tiny for now so the pruning path
        // gets exercised regularly; we expect to raise this substantially later.
        RpcAppFlavor::Nightly => 3,
        RpcAppFlavor::Bravo | RpcAppFlavor::Dev | RpcAppFlavor::Tests => 30,
    }
}

fn spawn_log_maintenance_thread(
    log_dir: PathBuf,
    current_unixday: u64,
    app_flavor: RpcAppFlavor,
) -> io::Result<()> {
    static MAINTENANCE_PASS: Once = Once::new();

    thread::Builder::new()
        .name("fedi-log-maintenance".to_owned())
        .spawn(move || {
            MAINTENANCE_PASS.call_once(|| {
                // Compression and retention can touch multiple files and issue
                // fsyncs, so keep startup on the fast path and do one best-effort
                // pass in the background.
                //
                // `current_unixday` is captured at startup instead of recomputed in
                // the worker so the pass never races a day rollover and compresses
                // the file the foreground logger is still appending to.
                if let Err(error) = run_log_maintenance_pass(&log_dir, current_unixday, app_flavor)
                {
                    eprintln!(
                        "fedi log maintenance startup pass failed for {}: {error:#}",
                        log_dir.display()
                    );
                }
            });
        })
        .map(|_| ())
}

fn run_log_maintenance_pass(
    log_dir: &Path,
    current_unixday: u64,
    app_flavor: RpcAppFlavor,
) -> anyhow::Result<()> {
    let log_dir_fd = File::open(log_dir)
        .with_context(|| format!("failed to open log directory {}", log_dir.display()))?;

    migrate_legacy_log_file(log_dir, &log_dir_fd)?;

    let mut raw_logs = Vec::new();
    for entry in std::fs::read_dir(log_dir)
        .with_context(|| format!("failed to read log directory {}", log_dir.display()))?
    {
        let entry =
            entry.with_context(|| format!("failed to read entry from {}", log_dir.display()))?;
        let file_name = entry.file_name();
        let Some(unixday) = parse_unixday(&file_name, RAW_LOG_PREFIX) else {
            continue;
        };
        if unixday == current_unixday {
            continue;
        }
        raw_logs.push((unixday, entry.path()));
    }

    for (unixday, raw_path) in raw_logs {
        let compressed_path = log_dir.join(format!("{COMPRESSED_LOG_PREFIX}{unixday}"));

        compress_log_file(&raw_path, &compressed_path)?;

        // Persist the new directory entry before removing the source file so a
        // crash cannot leave us with neither copy visible in the directory.
        sync_log_directory(&log_dir_fd)
            .with_context(|| format!("failed to fsync log directory {}", log_dir.display()))?;

        std::fs::remove_file(&raw_path)
            .with_context(|| format!("failed to remove source log {}", raw_path.display()))?;

        // Persist the removal as a separate step for the same reason: rename-
        // style atomicity is not available here because we change formats.
        sync_log_directory(&log_dir_fd)
            .with_context(|| format!("failed to fsync log directory {}", log_dir.display()))?;
    }

    let mut logz_files = Vec::new();
    for entry in std::fs::read_dir(log_dir)
        .with_context(|| format!("failed to read log directory {}", log_dir.display()))?
    {
        let entry =
            entry.with_context(|| format!("failed to read entry from {}", log_dir.display()))?;
        let file_name = entry.file_name();
        let Some(unixday) = parse_unixday(&file_name, COMPRESSED_LOG_PREFIX) else {
            continue;
        };
        logz_files.push((unixday, entry.path()));
    }

    logz_files.sort_by(|(lhs, _), (rhs, _)| rhs.cmp(lhs));

    for (_, old_logz_path) in logz_files
        .into_iter()
        .skip(max_compressed_log_files(app_flavor))
    {
        std::fs::remove_file(&old_logz_path).with_context(|| {
            format!(
                "failed to remove old compressed log {}",
                old_logz_path.display()
            )
        })?;

        sync_log_directory(&log_dir_fd)
            .with_context(|| format!("failed to fsync log directory {}", log_dir.display()))?;
    }

    Ok(())
}

fn compress_log_file(raw_path: &Path, compressed_path: &Path) -> anyhow::Result<()> {
    let mut source = File::open(raw_path)
        .with_context(|| format!("failed to open source log {}", raw_path.display()))?;
    let mut compressed = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        // A leftover `.logz` is treated as disposable cache material; the raw
        // `.log` is the canonical source and gets recompressed from scratch.
        .open(compressed_path)
        .with_context(|| {
            format!(
                "failed to open compressed destination {}",
                compressed_path.display()
            )
        })?;

    zstd::stream::copy_encode(&mut source, &mut compressed, 0).with_context(|| {
        format!(
            "failed to compress {} to {}",
            raw_path.display(),
            compressed_path.display()
        )
    })?;

    compressed.sync_all().with_context(|| {
        format!(
            "failed to fsync compressed log {}",
            compressed_path.display()
        )
    })?;

    Ok(())
}

// Older builds wrote a single `fedi.log` without a day suffix. Move it into
// the current naming scheme first, then let the normal maintenance pass
// compress and prune it like any other historical raw log.
fn migrate_legacy_log_file(log_dir: &Path, log_dir_fd: &File) -> anyhow::Result<()> {
    let legacy_log_path = log_dir.join(LEGACY_LOG_FILE_NAME);
    let Ok(metadata) = std::fs::metadata(&legacy_log_path) else {
        return Ok(());
    };

    if !metadata.is_file() {
        return Ok(());
    }

    let migrated_path = log_dir.join(format!("{RAW_LOG_PREFIX}{LEGACY_MIGRATION_UNIXDAY}"));
    anyhow::ensure!(
        !migrated_path.exists(),
        "legacy log migration target already exists: {}",
        migrated_path.display()
    );

    std::fs::rename(&legacy_log_path, &migrated_path).with_context(|| {
        format!(
            "failed to migrate legacy log {} to {}",
            legacy_log_path.display(),
            migrated_path.display()
        )
    })?;

    sync_log_directory(log_dir_fd)
        .with_context(|| format!("failed to fsync log directory {}", log_dir.display()))?;

    Ok(())
}

fn parse_unixday(file_name: &OsStr, prefix: &str) -> Option<u64> {
    let suffix = file_name.to_str()?.strip_prefix(prefix)?;
    suffix.parse().ok()
}

#[cfg(unix)]
fn sync_log_directory(log_dir_fd: &File) -> io::Result<()> {
    log_dir_fd.sync_all()
}

#[cfg(not(unix))]
fn sync_log_directory(_log_dir_fd: &File) -> io::Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs::{self, OpenOptions};
    use std::io::Write;
    use std::path::Path;

    use tempfile::tempdir;

    use super::{
        run_log_maintenance_pass, RpcAppFlavor, COMPRESSED_LOG_PREFIX, LEGACY_LOG_FILE_NAME,
        LEGACY_MIGRATION_UNIXDAY, RAW_LOG_PREFIX,
    };

    fn write_new_file(path: &Path, contents: impl AsRef<[u8]>) {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)
            .expect("create fixture file");
        file.write_all(contents.as_ref())
            .expect("write fixture file");
    }

    #[test]
    fn startup_pass_compresses_non_active_logs_and_keeps_active_log() {
        let temp = tempdir().expect("tempdir");
        let log_dir = temp.path();
        let current_unixday = 42_u64;
        let old_unixday = 41_u64;

        let active_path = log_dir.join(format!("{RAW_LOG_PREFIX}{current_unixday}"));
        let old_path = log_dir.join(format!("{RAW_LOG_PREFIX}{old_unixday}"));
        let old_logz_path = log_dir.join(format!("{COMPRESSED_LOG_PREFIX}{old_unixday}"));

        write_new_file(&active_path, "active log content");
        write_new_file(&old_path, "old raw log content");
        write_new_file(&old_logz_path, "stale compressed content");

        run_log_maintenance_pass(log_dir, current_unixday, RpcAppFlavor::Bravo)
            .expect("run maintenance");

        assert!(active_path.exists(), "active log should remain");
        assert!(!old_path.exists(), "old raw log should be removed");

        let compressed = fs::read(&old_logz_path).expect("read compressed log");
        let decompressed =
            zstd::stream::decode_all(&compressed[..]).expect("decode compressed log");
        assert_eq!(decompressed, b"old raw log content");
    }

    #[test]
    fn startup_pass_retains_only_newest_compressed_logs() {
        let temp = tempdir().expect("tempdir");
        let log_dir = temp.path();

        for day in 0_u64..35 {
            let path = log_dir.join(format!("{COMPRESSED_LOG_PREFIX}{day}"));
            write_new_file(&path, format!("compressed-{day}"));
        }

        run_log_maintenance_pass(log_dir, 999, RpcAppFlavor::Bravo).expect("run maintenance");

        let mut remaining_days = fs::read_dir(log_dir)
            .expect("read dir")
            .filter_map(|entry| {
                let entry = entry.ok()?;
                let name = entry.file_name();
                let name = name.to_str()?;
                let suffix = name.strip_prefix(COMPRESSED_LOG_PREFIX)?;
                suffix.parse::<u64>().ok()
            })
            .collect::<Vec<_>>();

        remaining_days.sort_unstable();
        assert_eq!(remaining_days.len(), 30);
        assert_eq!(remaining_days.first().copied(), Some(5));
        assert_eq!(remaining_days.last().copied(), Some(34));
    }

    #[test]
    fn startup_pass_uses_short_retention_for_nightly() {
        let temp = tempdir().expect("tempdir");
        let log_dir = temp.path();

        for day in 0_u64..10 {
            let path = log_dir.join(format!("{COMPRESSED_LOG_PREFIX}{day}"));
            write_new_file(&path, format!("compressed-{day}"));
        }

        run_log_maintenance_pass(log_dir, 999, RpcAppFlavor::Nightly).expect("run maintenance");

        let mut remaining_days = fs::read_dir(log_dir)
            .expect("read dir")
            .filter_map(|entry| {
                let entry = entry.ok()?;
                let name = entry.file_name();
                let name = name.to_str()?;
                let suffix = name.strip_prefix(COMPRESSED_LOG_PREFIX)?;
                suffix.parse::<u64>().ok()
            })
            .collect::<Vec<_>>();

        remaining_days.sort_unstable();
        assert_eq!(remaining_days.len(), 3);
        assert_eq!(remaining_days, vec![7, 8, 9]);
    }

    #[test]
    fn startup_pass_migrates_legacy_fedi_log_and_compresses_it() {
        let temp = tempdir().expect("tempdir");
        let log_dir = temp.path();

        let legacy_path = log_dir.join(LEGACY_LOG_FILE_NAME);
        let migrated_logz_path =
            log_dir.join(format!("{COMPRESSED_LOG_PREFIX}{LEGACY_MIGRATION_UNIXDAY}"));
        write_new_file(&legacy_path, "legacy log content");

        run_log_maintenance_pass(log_dir, 999, RpcAppFlavor::Bravo).expect("run maintenance");

        assert!(
            !legacy_path.exists(),
            "legacy log file should be migrated away"
        );
        assert!(
            !log_dir
                .join(format!("{RAW_LOG_PREFIX}{LEGACY_MIGRATION_UNIXDAY}"))
                .exists(),
            "migrated raw log should be compressed in same pass"
        );

        let compressed = fs::read(&migrated_logz_path).expect("read migrated compressed log");
        let decompressed =
            zstd::stream::decode_all(&compressed[..]).expect("decode migrated compressed log");
        assert_eq!(decompressed, b"legacy log content");
    }
}
