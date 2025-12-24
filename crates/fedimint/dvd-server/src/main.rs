use std::net::Ipv4Addr;
use std::sync::Arc;

use anyhow::Result;
use axum::extract::State;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use clap::Parser;
use devi::DevFed;
use devimint::cmd;
use dvd_client::*;
use fedimint_core::BitcoinHash;
use fedimint_logging::TracingSetup;
use listenfd::ListenFd;
use tokio::sync::OnceCell;
use tower_http::cors::{Any, CorsLayer};
use tracing::info;

#[derive(Clone)]
struct AppState {
    dev_fed: Arc<DevFed>,
}

#[derive(Parser)]
struct Cli {
    /// Port to listen on (default: 0 for random)
    #[arg(short, long, default_value = "0")]
    port: u16,

    /// Run a command after the server is ready
    #[arg(trailing_var_arg = true)]
    run_after_ready: Option<Vec<std::ffi::OsString>>,
}

#[tokio::main]
async fn main() -> Result<()> {
    TracingSetup::default().init()?;

    let cli = Cli::parse();

    info!("Starting devimint federation...");
    let dev_fed = DevFed::new_with_setup(4).await?;
    info!("Federation invite code: {}", dev_fed.fed.invite_code()?);

    let state = AppState {
        dev_fed: Arc::new(dev_fed),
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/invite_code", get(handle_invite_code))
        .route("/ecash/generate", post(handle_generate_ecash))
        .route("/ecash/receive", post(handle_receive_ecash))
        .route("/bitcoin/send", post(handle_send_bitcoin))
        .route("/bitcoin/mine", post(handle_mine_blocks))
        .route("/bitcoin/address", get(handle_bitcoin_address))
        .route("/lightning/invoice", post(handle_lnd_invoice))
        .route("/lightning/pay", post(handle_lnd_pay))
        .route("/lightning/wait", post(handle_lnd_wait))
        .route("/lightning/pubkey", get(handle_lnd_pubkey))
        .route("/gateway/invoice", post(handle_gateway_invoice))
        .route("/gateway/wait", post(handle_gateway_wait))
        .route("/recurringd/url", get(handle_recurringd_url))
        .layer(cors)
        .with_state(state);

    let mut listenfd = ListenFd::from_env();
    let listener = if let Some(listener) = listenfd.take_tcp_listener(0)? {
        info!("Using listenfd socket");
        listener.set_nonblocking(true)?;
        tokio::net::TcpListener::from_std(listener)?
    } else {
        tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, cli.port)).await?
    };

    let port = listener.local_addr()?.port();
    info!("DVD server listening on http://127.0.0.1:{port}");

    // Set env var for tests to discover the server
    unsafe {
        std::env::set_var("DVD_SERVER_URL", format!("http://127.0.0.1:{port}"));
    }

    let user_cmd_failed = Arc::new(OnceCell::new());
    let user_cmd_failed2 = user_cmd_failed.clone();
    let shutdown_signal = async move {
        if let Some(command) = cli.run_after_ready {
            if devimint::cli::exec_user_command(command).await.is_err() {
                user_cmd_failed2.set(true).unwrap();
            }
        } else {
            tokio::signal::ctrl_c()
                .await
                .expect("failed to listen to event")
        }
    };

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal)
        .await?;

    if user_cmd_failed.get().is_some_and(|x| *x) {
        anyhow::bail!("User command failed");
    }

    Ok(())
}

struct DvdError(anyhow::Error);

impl<T: Into<anyhow::Error>> From<T> for DvdError {
    fn from(value: T) -> Self {
        Self(value.into())
    }
}

impl IntoResponse for DvdError {
    fn into_response(self) -> axum::response::Response {
        let error_msg = self.0.to_string();
        (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: error_msg }),
        )
            .into_response()
    }
}

async fn handle_invite_code(
    State(state): State<AppState>,
) -> Result<Json<InviteCodeResponse>, DvdError> {
    let invite_code = state.dev_fed.fed.invite_code()?;
    Ok(Json(InviteCodeResponse { invite_code }))
}

async fn handle_generate_ecash(
    State(state): State<AppState>,
    Json(req): Json<GenerateEcashRequest>,
) -> Result<Json<GenerateEcashResponse>, DvdError> {
    let client = state.dev_fed.fed.internal_client().await?;
    let ecash = cmd!(client, "spend", "--allow-overpay", req.amount_msats)
        .out_json()
        .await?["notes"]
        .as_str()
        .unwrap()
        .to_owned();
    Ok(Json(GenerateEcashResponse { ecash }))
}

async fn handle_receive_ecash(
    State(state): State<AppState>,
    Json(req): Json<ReceiveEcashRequest>,
) -> Result<Json<()>, DvdError> {
    let client = state.dev_fed.fed.internal_client().await?;
    cmd!(client, "reissue", req.ecash).run().await?;
    Ok(Json(()))
}

async fn handle_send_bitcoin(
    State(state): State<AppState>,
    Json(req): Json<SendBitcoinRequest>,
) -> Result<Json<SendBitcoinResponse>, DvdError> {
    let txid = state
        .dev_fed
        .bitcoind
        .send_to(req.address, req.amount_sats)
        .await?;
    // Mine blocks to confirm the transaction
    state.dev_fed.bitcoind.mine_blocks(11).await?;
    Ok(Json(SendBitcoinResponse {
        txid: txid.to_string(),
    }))
}

async fn handle_mine_blocks(
    State(state): State<AppState>,
    Json(req): Json<MineBlocksRequest>,
) -> Result<Json<()>, DvdError> {
    state.dev_fed.bitcoind.mine_blocks(req.count).await?;
    Ok(Json(()))
}

async fn handle_bitcoin_address(
    State(state): State<AppState>,
) -> Result<Json<BitcoinAddressResponse>, DvdError> {
    let address = state.dev_fed.bitcoind.get_new_address().await?;
    Ok(Json(BitcoinAddressResponse {
        address: address.to_string(),
    }))
}

async fn handle_lnd_invoice(
    State(state): State<AppState>,
    Json(req): Json<CreateInvoiceRequest>,
) -> Result<Json<LndInvoiceResponse>, DvdError> {
    let (invoice, payment_hash) = state.dev_fed.lnd.invoice(req.amount_msats).await?;
    Ok(Json(LndInvoiceResponse {
        invoice,
        payment_hash,
    }))
}

async fn handle_lnd_pay(
    State(state): State<AppState>,
    Json(req): Json<PayInvoiceRequest>,
) -> Result<Json<()>, DvdError> {
    state.dev_fed.lnd.pay_bolt11_invoice(req.invoice).await?;
    Ok(Json(()))
}

async fn handle_lnd_wait(
    State(state): State<AppState>,
    Json(req): Json<WaitInvoiceRequest>,
) -> Result<Json<()>, DvdError> {
    state
        .dev_fed
        .lnd
        .wait_bolt11_invoice(req.payment_hash)
        .await?;
    Ok(Json(()))
}

async fn handle_lnd_pubkey(
    State(state): State<AppState>,
) -> Result<Json<LndPubkeyResponse>, DvdError> {
    let pubkey = state.dev_fed.lnd.pub_key().await?;
    Ok(Json(LndPubkeyResponse { pubkey }))
}

async fn handle_gateway_invoice(
    State(state): State<AppState>,
    Json(req): Json<CreateInvoiceRequest>,
) -> Result<Json<GatewayInvoiceResponse>, DvdError> {
    let invoice = state
        .dev_fed
        .gw_ldk
        .create_invoice(req.amount_msats)
        .await?;
    let payment_hash = invoice.payment_hash().to_byte_array().to_vec();
    Ok(Json(GatewayInvoiceResponse {
        invoice: invoice.to_string(),
        payment_hash,
    }))
}

async fn handle_gateway_wait(
    State(state): State<AppState>,
    Json(req): Json<WaitInvoiceRequest>,
) -> Result<Json<()>, DvdError> {
    state
        .dev_fed
        .gw_ldk
        .wait_bolt11_invoice(req.payment_hash)
        .await?;
    Ok(Json(()))
}

async fn handle_recurringd_url(
    State(state): State<AppState>,
) -> Result<Json<RecurringdUrlResponse>, DvdError> {
    Ok(Json(RecurringdUrlResponse {
        url: state.dev_fed.recurringd.api_url.to_string(),
    }))
}
