//! Bridge startup can't wait for matrix initialization on startup, so this
//! provides lazy matrix initialzing.

use std::sync::Arc;

use fedimint_derive_secret::ChildId;
use matrix::Matrix;
use multispend::multispend_matrix::MultispendMatrix;
use multispend::services::MultispendServices;
use rpc_types::error::RpcError;
use rpc_types::matrix::MatrixInitializeStatus;
use runtime::bridge_runtime::Runtime;
use runtime::constants::MATRIX_CHILD_ID;
use runtime::observable::Observable;
use tokio::sync::{watch, OnceCell};

pub struct BgMatrix {
    initialized: OnceCell<(Arc<Matrix>, Arc<MultispendMatrix>)>,
    status: watch::Sender<MatrixInitializeStatus>,
}

impl BgMatrix {
    #[cfg_attr(test, allow(unused_variables))]
    pub fn new(
        runtime: Arc<Runtime>,
        user_name: String,
        multispend_services: Arc<MultispendServices>,
    ) -> Arc<Self> {
        let bg_matrix = Arc::new(Self {
            initialized: OnceCell::new(),
            status: watch::Sender::new(MatrixInitializeStatus::Starting),
        });

        #[cfg(not(test))] // don't start matrix in tests
        runtime
            .task_group
            .clone()
            .spawn_cancellable("BgMatrix::initialize", {
                let bg_matrix = bg_matrix.clone();
                async move {
                    bg_matrix
                        .initialize(runtime, &user_name, multispend_services)
                        .await;
                }
            });

        bg_matrix
    }

    pub async fn observe_status(
        &self,
        runtime: &Runtime,
        observable_id: u64,
    ) -> anyhow::Result<Observable<MatrixInitializeStatus>> {
        let status_rx = self.status.subscribe();

        runtime
            .observable_pool
            .make_observable_from_stream(
                observable_id,
                None,
                tokio_stream::wrappers::WatchStream::new(status_rx),
            )
            .await
    }

    pub async fn initialize(
        &self,
        runtime: Arc<Runtime>,
        user_name: &str,
        multispend_services: Arc<MultispendServices>,
    ) {
        let global_root_secret = runtime.app_state.root_secret().await;
        let matrix_secret = global_root_secret.child_key(ChildId(MATRIX_CHILD_ID));
        let result = Matrix::init(
            runtime.clone(),
            &runtime.storage.platform_path("matrix".as_ref()),
            &matrix_secret,
            user_name,
            runtime.feature_catalog.matrix.home_server.clone(),
            &self.status,
        )
        .await;

        match result {
            Ok(matrix) => {
                let multispend_matrix = Arc::new(MultispendMatrix::new(
                    matrix.client.clone(),
                    runtime,
                    multispend_services,
                ));
                // important: start listening to messages before syncing
                multispend_matrix.register_message_handler();
                matrix.start_syncing();
                assert!(
                    self.initialized.set((matrix, multispend_matrix)).is_ok(),
                    "matrix initialize is only called once"
                );
                self.status.send_replace(MatrixInitializeStatus::Success);
            }
            Err(err) => {
                self.status.send_replace(MatrixInitializeStatus::Error {
                    error: RpcError::from_anyhow(&err),
                });
            }
        }
    }

    async fn wait_inner(&self) -> &(Arc<Matrix>, Arc<MultispendMatrix>) {
        // important: just hangs on failed starts
        if let Some(value) = self.initialized.get() {
            return value;
        }

        let mut status_rx = self.status.subscribe();
        status_rx
            .wait_for(|status| matches!(status, MatrixInitializeStatus::Success))
            .await
            .expect("channel must not close because self holds the sender");

        self.initialized
            .get()
            .expect("matrix must be initialized after success status")
    }

    pub async fn wait(&self) -> &Arc<Matrix> {
        &self.wait_inner().await.0
    }

    pub async fn wait_multispend(&self) -> &Arc<MultispendMatrix> {
        &self.wait_inner().await.1
    }
}
