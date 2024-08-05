use std::sync::Arc;
use std::time::{Duration, SystemTime};

use anyhow::{anyhow, bail};
use fedimint_core::task::TaskGroup;
use fedimint_core::util::{retry, FibonacciBackoff};
use tracing::{error, info};

use crate::api::{IFediApi, RegisterDeviceError, RegisteredDevice};
use crate::constants::{DEVICE_REGISTRATION_FREQUENCY, DEVICE_REGISTRATION_OVERDUE};
use crate::event::{Event, EventSink, TypedEventExt};
use crate::storage::{AppState, DeviceIdentifier};

pub struct DeviceRegistrationService {
    app_state: Arc<AppState>,
    fedi_api: Arc<dyn IFediApi>,
    active_task_subgroup: Option<TaskGroup>,
}

impl DeviceRegistrationService {
    pub async fn new(
        app_state: Arc<AppState>,
        event_sink: EventSink,
        task_group: &TaskGroup,
        fedi_api: Arc<dyn IFediApi>,
    ) -> Self {
        let mut service = Self {
            app_state: app_state.clone(),
            fedi_api: fedi_api.clone(),
            active_task_subgroup: None,
        };

        if let (Some(device_identifier), Ok(encrypted_device_identifier), Some(device_index)) = (
            app_state.device_identifier().await,
            app_state.encrypted_device_identifier().await,
            app_state.device_index().await,
        ) {
            service
                .start_periodic_registration_inner(
                    device_identifier,
                    encrypted_device_identifier,
                    device_index,
                    task_group,
                    event_sink,
                )
                .await;
        }

        service
    }

    pub async fn stop_ongoing_periodic_registration(&mut self) -> anyhow::Result<()> {
        if let Some(subgroup) = self.active_task_subgroup.take() {
            subgroup
                .shutdown_join_all(Some(Duration::from_secs(20)))
                .await?;
        }
        Ok(())
    }

    pub async fn start_ongoing_periodic_registration(
        &mut self,
        device_index: u8,
        task_group: &TaskGroup,
        event_sink: EventSink,
    ) -> anyhow::Result<()> {
        if self.active_task_subgroup.is_some() {
            bail!("Stop currently ongoing device registration task first");
        }

        match (
            self.app_state.device_identifier().await,
            self.app_state.encrypted_device_identifier().await,
        ) {
            (Some(device_identifier), Ok(encrypted_device_identifier)) => {
                self.start_periodic_registration_inner(
                    device_identifier,
                    encrypted_device_identifier,
                    device_index,
                    task_group,
                    event_sink,
                )
                .await;
            }
            _ => bail!("Missing device identifier, this shouldn't happen!"),
        }

        Ok(())
    }

    async fn start_periodic_registration_inner(
        &mut self,
        device_identifier: DeviceIdentifier,
        encrypted_device_identifier: String,
        device_index: u8,
        task_group: &TaskGroup,
        event_sink: EventSink,
    ) {
        let subgroup = task_group.make_subgroup().await;
        subgroup.spawn_cancellable(
            "device_registration_service",
            renew_registration_periodically(
                device_identifier,
                encrypted_device_identifier,
                device_index,
                self.app_state.clone(),
                event_sink,
                self.fedi_api.clone(),
            ),
        );
        self.active_task_subgroup = Some(subgroup);
    }
}

async fn renew_registration_periodically(
    device_identifier: DeviceIdentifier,
    encrypted_device_identifier: String,
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
        if register_device_with_backoff(
            app_state.clone(),
            fedi_api.clone(),
            event_sink.clone(),
            seed.clone(),
            device_index,
            device_identifier.clone(),
            encrypted_device_identifier.clone(),
            false,
        )
        .await
        .is_err()
        {
            break;
        }

        let last_registration_timestamp = app_state
            .with_read_lock(|state| state.last_device_registration_timestamp)
            .await
            .unwrap_or(SystemTime::UNIX_EPOCH);

        let now = fedimint_core::time::now();
        let next_registration_timestamp =
            last_registration_timestamp + DEVICE_REGISTRATION_FREQUENCY;
        let sleep_duration = next_registration_timestamp
            .duration_since(now)
            .unwrap_or_default();

        fedimint_core::task::sleep(sleep_duration).await;
    }
}

pub async fn get_registered_devices_with_backoff(
    fedi_api: Arc<dyn IFediApi>,
    seed: bip39::Mnemonic,
) -> anyhow::Result<Vec<RegisteredDevice>> {
    retry(
        "fetch_registered_devices",
        FibonacciBackoff::default()
            .with_min_delay(Duration::from_secs(1))
            .with_max_delay(Duration::from_secs(20 * 60))
            .with_max_times(usize::MAX)
            .with_jitter(),
        || fedi_api.fetch_registered_devices_for_seed(seed.clone()),
    )
    .await
}

#[allow(clippy::too_many_arguments)]
pub async fn register_device_with_backoff(
    app_state: Arc<AppState>,
    fedi_api: Arc<dyn IFediApi>,
    event_sink: EventSink,
    seed: bip39::Mnemonic,
    device_index: u8,
    device_identifier: DeviceIdentifier,
    encrypted_device_identifier: String,
    force_overwrite: bool,
) -> anyhow::Result<()> {
    enum RegisterDeviceRetryOk {
        Success,
        Conflict(String),
    }

    let retry_res = retry(
        "register_device",
        FibonacciBackoff::default()
            .with_min_delay(Duration::from_secs(1))
            .with_max_delay(Duration::from_secs(20 * 60))
            .with_max_times(usize::MAX)
            .with_jitter(),
        || async {
            match fedi_api
                .register_device_for_seed(
                    seed.clone(),
                    device_index,
                    device_identifier.clone(),
                    encrypted_device_identifier.clone(),
                    force_overwrite,
                )
                .await
            {
                Ok(_) => {
                    info!("successfully registered device with index {device_index}");
                    // AppState write shouldn't fail, but timestamp update is not critical anyway
                    let _ = app_state
                        .with_write_lock(|state| {
                            state.last_device_registration_timestamp =
                                Some(fedimint_core::time::now());
                        })
                        .await;
                    event_sink.typed_event(&Event::device_registration(
                        crate::event::DeviceRegistrationState::Success,
                    ));
                    Ok(RegisterDeviceRetryOk::Success)
                }
                Err(RegisterDeviceError::AnotherDeviceOwnsIndex(error)) => {
                    error!(%error, "unexpected device registration conflict");
                    event_sink.typed_event(&Event::device_registration(
                        crate::event::DeviceRegistrationState::Conflict,
                    ));
                    // Return an Ok to indicate the error is non-retryable
                    Ok(RegisterDeviceRetryOk::Conflict(error))
                }
                Err(error) => {
                    error!(?error, "register device failed, retrying");
                    // If more than 12 hours since last successful registration renewal, emit
                    // Overdue event
                    if let Some(last_registration_timestamp) = app_state
                        .with_read_lock(|state| state.last_device_registration_timestamp)
                        .await
                    {
                        if last_registration_timestamp + DEVICE_REGISTRATION_OVERDUE
                            < fedimint_core::time::now()
                        {
                            event_sink.typed_event(&Event::device_registration(
                                crate::event::DeviceRegistrationState::Overdue,
                            ));
                        }
                    }
                    // Return an Err to indicate error is retryable
                    Err(anyhow!("register device failed, retrying"))
                }
            }
        },
    )
    .await;

    match retry_res {
        Ok(RegisterDeviceRetryOk::Success) => Ok(()),
        Ok(RegisterDeviceRetryOk::Conflict(error)) => Err(anyhow!(error)),
        Err(error) => Err(error),
    }
}
