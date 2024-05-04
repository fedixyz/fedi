use std::path::PathBuf;
use std::sync::{Arc, OnceLock};
use std::thread;

use anyhow::{Context, Result};
use fedimint_core::task;
use fedimint_logging::TracingSetup;
use futures::{Future, SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio_util::codec::{Framed, LinesCodec};
use tracing::{error, info};

use crate::api::LiveFediApi;
use crate::event::IEventSink;
use crate::features::FeatureCatalog;
use crate::ffi::PathBasedStorage;
use crate::rpc::{fedimint_initialize_async, fedimint_rpc_async};

#[derive(Serialize, Deserialize, Debug)]
pub struct Request {
    pub method: String,
    pub body: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub enum Response {
    Reply { body: String },
    Event { event_type: String, body: String },
}

pub type PendingResponses = Arc<Mutex<Option<oneshot::Sender<String>>>>;

pub struct Client {
    pending_response: PendingResponses,
    tx: mpsc::Sender<Request>,
    event_sink: Arc<Mutex<Box<dyn IEventSink>>>,
}

impl Client {
    pub async fn new(event_sink: Arc<Mutex<Box<dyn IEventSink>>>) -> Result<Self> {
        #[cfg(not(target_os = "android"))]
        let connection = TcpStream::connect("localhost:13127").await?;
        #[cfg(target_os = "android")]
        let connection = TcpStream::connect("10.0.2.2:13127").await?;
        let mut connection = Framed::new(connection, LinesCodec::new());
        let pending_response = PendingResponses::default();
        let (tx, mut rx) = mpsc::channel::<Request>(32);

        let pending_response_cloned = Arc::clone(&pending_response);

        let event_sink2 = event_sink.clone();
        task::spawn("client events", async move {
            loop {
                tokio::select! {
                    Some(request) = rx.recv() => {
                        let request_json = serde_json::to_string(&request).unwrap();
                        connection.send(request_json).await.unwrap();
                    },
                    result = connection.next() => match result {
                        Some(Ok(line)) => {
                            match serde_json::from_str(&line) {
                                Ok(Response::Event { event_type, body }) => {
                                    let event_sink = event_sink.lock().await;
                                    event_sink.event(event_type, body);
                                },
                                Ok(Response::Reply { body }) => {
                                    if let Some(responder) = pending_response_cloned.lock().await.take() {
                                        let _ = responder.send( body );
                                    } else {
                                        error!("unknown response");
                                    }
                                },
                                Err(e) => error!("Failed to deserialize response: {}", e),
                            }
                        },
                        Some(Err(e)) => error!("Connection error: {}", e),
                        None => break,
                    }
                }
            }
        });

        Ok(Self {
            pending_response,
            tx,
            event_sink: event_sink2,
        })
    }

    pub fn is_disconnected(&self) -> bool {
        self.tx.is_closed()
    }

    pub async fn request(&self, method: String, body: String) -> Result<String> {
        let (tx, rx) = oneshot::channel();
        *self.pending_response.lock().await = Some(tx);

        let request = Request { method, body };
        self.tx.send(request).await?;
        rx.await.map_err(|e| e.into())
    }
}

pub fn tcp_server() -> (
    mpsc::Sender<Response>,
    mpsc::Receiver<Request>,
    impl Future + Send + Sync,
) {
    let (response_tx, mut response_rx) = mpsc::channel::<Response>(32);
    let (request_tx, request_rx) = mpsc::channel::<Request>(32);

    (response_tx, request_rx, async move {
        let listener = TcpListener::bind("0.0.0.0:13127").await?;
        info!("Server listening on port 13127");

        while let Ok((socket, _)) = listener.accept().await {
            let mut framed = Framed::new(socket, LinesCodec::new());

            loop {
                tokio::select! {
                    result = framed.next() => {
                        match result {
                            Some(Ok(line)) => {
                                match serde_json::from_str(&line) {
                                    Ok(req) => {
                                        request_tx.send(req).await?;
                                    }
                                    Err(e) => error!("Error: {}", e),
                                }
                            }
                            Some(Err(e)) => error!("Connection error: {}", e),
                            None => {
                                break;
                            }
                        }
                    }
                    Some(response) = response_rx.recv() => {
                        let response_json = serde_json::to_string(&response)?;
                        framed.send(response_json).await?;
                    }
                }
            }
            error!("Connection closed, waiting for new connection.");
        }
        anyhow::Ok(())
    })
}

impl IEventSink for mpsc::Sender<Response> {
    fn event(&self, event_type: String, body: String) {
        tokio::task::block_in_place(|| {
            self.blocking_send(Response::Event { event_type, body })
                .unwrap()
        });
    }
}

pub async fn init(data_dir: PathBuf) -> anyhow::Result<()> {
    TracingSetup::default().init()?;
    let (response_tx, mut request_rx, server_task) = tcp_server();
    thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("failed to build tokio runtime");
        rt.block_on(server_task);
    });
    let storage = PathBasedStorage::new(data_dir).await?;
    let bridge = fedimint_initialize_async(
        Arc::new(storage),
        Arc::new(response_tx.clone()),
        Arc::new(LiveFediApi::new()),
        "Unknown (remote bridge)".to_owned(),
        FeatureCatalog::new(crate::features::RuntimeEnvironment::Dev).into(),
    )
    .await
    .context("fedimint initalize")?;

    while let Some(request) = request_rx.recv().await {
        let response = fedimint_rpc_async(bridge.clone(), request.method, request.body).await;
        response_tx
            .send(Response::Reply { body: response })
            .await
            .context("send response")?;
    }
    Ok(())
}

static CLIENT: OnceLock<Mutex<Client>> = OnceLock::new();
pub async fn fedimint_remote_initialize(event_sink: Box<dyn IEventSink>) -> anyhow::Result<()> {
    let client = Client::new(Arc::new(Mutex::new(event_sink))).await?;
    let _ = CLIENT.set(Mutex::new(client));
    Ok(())
}

pub async fn fedimint_remote_rpc(method: String, payload: String) -> anyhow::Result<String> {
    let client = CLIENT.get().expect("client not initialized");
    let mut client = client.lock().await;
    if client.is_disconnected() {
        *client = Client::new(client.event_sink.clone())
            .await
            .context("failed to connect to remote bridge")?;
    }

    let reply = client
        .request(method, payload)
        .await
        .context("failed to communicate with remote bridge")?;
    Ok(reply)
}
