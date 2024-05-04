use std::sync::Arc;
use std::time::{Duration, SystemTime};

use anyhow::bail;
use fedimint_core::task::TaskGroup;
use tracing::{error, info};

use crate::api::{IFediApi, RegisterDeviceError};
use crate::constants::BACKUP_FREQUENCY;
use crate::event::{Event, EventSink, TypedEventExt};
use crate::storage::AppState;

pub struct DeviceRegistrationService {
    _device_identifier: String,
    _app_state: Arc<AppState>,
    _event_sink: EventSink,
    _task_group: TaskGroup,
    _fedi_api: Arc<dyn IFediApi>,
    active_task_subgroup: Option<TaskGroup>,
}

impl DeviceRegistrationService {
    pub async fn new(
        device_identifier: String,
        app_state: Arc<AppState>,
        event_sink: EventSink,
        task_group: TaskGroup,
        fedi_api: Arc<dyn IFediApi>,
    ) -> Self {
        let mut service = Self {
            _device_identifier: device_identifier.clone(),
            _app_state: app_state.clone(),
            _event_sink: event_sink.clone(),
            _task_group: task_group.clone(),
            _fedi_api: fedi_api.clone(),
            active_task_subgroup: None,
        };

        if let Some(device_index) = app_state.with_read_lock(|state| state.device_index).await {
            let subgroup = task_group.make_subgroup().await;
            subgroup.spawn_cancellable("device_registration_service", async move {
                renew_registration_periodically(
                    device_identifier,
                    device_index,
                    app_state,
                    event_sink,
                    fedi_api,
                )
                .await
            });
            service.active_task_subgroup = Some(subgroup);
        }
        service
    }
}

async fn renew_registration_periodically(
    device_identifier: String,
    device_index: u8,
    app_state: Arc<AppState>,
    event_sink: EventSink,
    fedi_api: Arc<dyn IFediApi>,
) {
    let seed = app_state.root_mnemonic().await;

    // Start the periodic activity of renewing this device's
    // registration every so often. Should this renewal ever fail because of
    // a conflicting device that's registered with Fedi's servers using the
    // same device index, we emit an event to let the UI know that
    // this device should no longer be used.
    loop {
        let last_registration_timestamp = app_state
            .with_read_lock(|state| state.last_device_registration_timestamp)
            .await
            .unwrap_or(SystemTime::UNIX_EPOCH);

        let now = fedimint_core::time::now();
        let next_registration_timestamp = last_registration_timestamp + BACKUP_FREQUENCY;
        let sleep_duration = next_registration_timestamp
            .duration_since(now)
            .unwrap_or_default();

        fedimint_core::task::sleep(sleep_duration).await;
        if register_device_with_backoff(
            app_state.clone(),
            fedi_api.clone(),
            event_sink.clone(),
            seed.clone(),
            device_index,
            device_identifier.clone(),
        )
        .await
        .is_err()
        {
            break;
        }
    }
}

async fn register_device_with_backoff(
    app_state: Arc<AppState>,
    fedi_api: Arc<dyn IFediApi>,
    event_sink: EventSink,
    seed: bip39::Mnemonic,
    device_index: u8,
    device_identifier: String,
) -> anyhow::Result<()> {
    for attempt in 1u64.. {
        match fedi_api
            .register_device_for_seed(seed.clone(), device_index, device_identifier.clone(), false)
            .await
        {
            Ok(_) => {
                info!("successfully registered device with index {device_index}");
                // AppState write shouldn't fail, but timestamp update is not critical anyway
                let _ = app_state
                    .with_write_lock(|state| {
                        state.last_device_registration_timestamp = Some(fedimint_core::time::now());
                    })
                    .await;
                event_sink.typed_event(&Event::device_registration(
                    crate::event::DeviceRegistrationState::Success,
                ));
                return Ok(());
            }
            Err(RegisterDeviceError::AnotherDeviceOwnsIndex(error)) => {
                error!(%error, "unexpected device registration conflict");
                event_sink.typed_event(&Event::device_registration(
                    crate::event::DeviceRegistrationState::Conflict,
                ));
                bail!(error);
            }
            Err(error) => {
                error!(%attempt, ?error, "register device failed");
                event_sink.typed_event(&Event::device_registration(
                    crate::event::DeviceRegistrationState::Overdue,
                ));
            }
        }

        let sleep_time = 1 << attempt.min(9);
        fedimint_core::task::sleep(Duration::from_secs(sleep_time)).await;
    }
    Ok(())
}
