use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, bail};
use fedimint_core::task::TaskGroup;
use fedimint_core::util::backoff_util::custom_backoff;
use fedimint_core::util::retry;
use tracing::{error, info};

use crate::api::{IFediApi, RegisterDeviceError, RegisteredDevice};
use crate::bridge::BridgeRuntime;
use crate::constants::{DEVICE_REGISTRATION_FREQUENCY, DEVICE_REGISTRATION_OVERDUE};
use crate::event::{Event, EventSink, TypedEventExt};
use crate::storage::AppState;

pub struct DeviceRegistrationService {
    app_state: Arc<AppState>,
    fedi_api: Arc<dyn IFediApi>,
    active_task_subgroup: Option<TaskGroup>,
}

impl DeviceRegistrationService {
    pub async fn new(runtime: Arc<BridgeRuntime>) -> Self {
        let mut service = Self {
            app_state: runtime.app_state.clone(),
            fedi_api: runtime.fedi_api.clone(),
            active_task_subgroup: None,
        };

        if let Some(device_index) = service.app_state.device_index().await {
            service
                .start_periodic_registration_inner(
                    device_index,
                    &runtime.task_group,
                    runtime.event_sink.clone(),
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

        self.start_periodic_registration_inner(device_index, task_group, event_sink)
            .await;

        Ok(())
    }

    async fn start_periodic_registration_inner(
        &mut self,
        device_index: u8,
        task_group: &TaskGroup,
        event_sink: EventSink,
    ) {
        let subgroup = task_group.make_subgroup();
        subgroup.spawn_cancellable(
            "device_registration_service",
            renew_registration_periodically(
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
    device_index: u8,
    app_state: Arc<AppState>,
    event_sink: EventSink,
    fedi_api: Arc<dyn IFediApi>,
) {
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
            device_index,
            false,
        )
        .await
        .is_err()
        {
            break;
        }

        fedimint_core::task::sleep(DEVICE_REGISTRATION_FREQUENCY).await;
    }
}

pub async fn get_registered_devices_with_backoff(
    fedi_api: Arc<dyn IFediApi>,
    seed: bip39::Mnemonic,
) -> anyhow::Result<Vec<RegisteredDevice>> {
    retry(
        "fetch_registered_devices",
        custom_backoff(Duration::from_secs(1), Duration::from_secs(20 * 60), None),
        || fedi_api.fetch_registered_devices_for_seed(seed.clone()),
    )
    .await
}

#[allow(clippy::too_many_arguments)]
pub async fn register_device_with_backoff(
    app_state: Arc<AppState>,
    fedi_api: Arc<dyn IFediApi>,
    event_sink: EventSink,
    device_index: u8,
    force_overwrite: bool,
) -> anyhow::Result<()> {
    let seed = app_state.root_mnemonic().await;
    let encrypted_device_identifier_v2 = app_state.encrypted_device_identifier().await;

    enum RegisterDeviceRetryOk {
        Success,
        Conflict(String),
    }

    async fn register_device_inner(
        app_state: Arc<AppState>,
        fedi_api: Arc<dyn IFediApi>,
        event_sink: EventSink,
        seed: bip39::Mnemonic,
        enc_device_id: String,
        device_index: u8,
        force_overwrite: bool,
        emit_event_on_conflict: bool,
    ) -> anyhow::Result<RegisterDeviceRetryOk> {
        retry(
            "register_device",
            custom_backoff(Duration::from_secs(1), Duration::from_secs(20 * 60), None),
            || async {
                match fedi_api
                    .register_device_for_seed(
                        seed.clone(),
                        device_index,
                        enc_device_id.clone(),
                        force_overwrite,
                    )
                    .await
                {
                    Ok(_) => {
                        info!("successfully registered device with index {device_index}");
                        // AppState write shouldn't fail, but timestamp update is not critical
                        // anyway
                        let _ = app_state
                            .with_write_lock(|state| {
                                state.last_device_registration_timestamp =
                                    Some(fedimint_core::time::now());
                            })
                            .await
                            .inspect_err(|e| error!(?e, "failed to write to app state"));
                        event_sink.typed_event(&Event::device_registration(
                            crate::event::DeviceRegistrationState::Success,
                        ));
                        Ok(RegisterDeviceRetryOk::Success)
                    }
                    Err(RegisterDeviceError::AnotherDeviceOwnsIndex(error)) => {
                        error!(%error, "unexpected device registration conflict");
                        if emit_event_on_conflict {
                            event_sink.typed_event(&Event::device_registration(
                                crate::event::DeviceRegistrationState::Conflict,
                            ));
                        }
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
        .await
    }

    // If encrypted_device_identifier_v1 is Some(_), then there's the possibility
    // that an ownership transfer to encrypted_device_identifier_v2 is still needed.
    // So in that case we don't prematurely emit an event on device registration
    // conflict.
    #[allow(deprecated)]
    let encrypted_device_identifier_v1 = app_state.encrypted_device_identifier_v1().await;
    let emit_event_on_conflict = encrypted_device_identifier_v1.is_none();

    match register_device_inner(
        app_state.clone(),
        fedi_api.clone(),
        event_sink.clone(),
        seed.clone(),
        encrypted_device_identifier_v2.clone(),
        device_index,
        force_overwrite,
        emit_event_on_conflict,
    )
    .await
    {
        Ok(RegisterDeviceRetryOk::Success) => Ok(()),
        Ok(RegisterDeviceRetryOk::Conflict(error)) => {
            // If registering with encrypted_device_identifier_v2 results in conflict AND
            // encrypted_device_identifier_v1 is Some(_), try to silently take over
            // ownership. Otherwise we would have already emitted the conflict event as part
            // of the call to the closure above.
            let Some(encrypted_device_identifier_v1) = encrypted_device_identifier_v1 else {
                return Err(anyhow!(error));
            };

            match register_device_inner(
                app_state.clone(),
                fedi_api.clone(),
                event_sink.clone(),
                seed.clone(),
                encrypted_device_identifier_v1,
                device_index,
                force_overwrite,
                true,
            )
            .await
            {
                Ok(RegisterDeviceRetryOk::Success) => {
                    // If registering with encrypted_device_identifier_v1 is
                    // successful, attempt to sliently transfer the ownership
                    // to encrypted_device_identifier_v2.
                    match register_device_inner(
                        app_state.clone(),
                        fedi_api.clone(),
                        event_sink.clone(),
                        seed.clone(),
                        encrypted_device_identifier_v2,
                        device_index,
                        true,
                        true,
                    )
                    .await
                    {
                        Ok(RegisterDeviceRetryOk::Success) => {
                            // Once the ownership has been successfully transferred, clear out
                            // encrypted_device_identifier_v1
                            #[allow(deprecated)]
                            app_state.clear_encrypted_device_identifier_v1().await
                        }
                        Ok(RegisterDeviceRetryOk::Conflict(error)) => Err(anyhow!(error)),
                        Err(error) => Err(error),
                    }
                }
                Ok(RegisterDeviceRetryOk::Conflict(error)) => Err(anyhow!(error)),
                Err(error) => Err(error),
            }
        }
        Err(error) => Err(error),
    }
}
