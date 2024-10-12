use std::collections::BTreeMap;
use std::convert::Infallible;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{bail, Context};
use bitcoin::bech32::{self, FromBase32};
use fedimint_core::task::TaskGroup;
use fedimint_core::util::backon::FibonacciBuilder as FibonacciBackoff;
use fedimint_core::util::update_merge::UpdateMerge;
use serde::{Deserialize, Serialize};
use tokio::sync::{Mutex, RwLock};
use tracing::info;

use crate::constants::COMMUNITY_INVITE_CODE_HRP;
use crate::error::ErrorCode;
use crate::event::{Event, EventSink, TypedEventExt};
use crate::storage::{AppState, CommunityInfo};
use crate::types::RpcCommunity;

/// Communities is a coordinator-like struct that encapsulates all state and
/// logic related to the functionality of communities. The Bridge struct
/// contains a Communities struct and it delegates all communities-related calls
/// to its Communities struct.
#[derive(Clone)]
pub struct Communities {
    pub communities: Arc<Mutex<BTreeMap<String, Community>>>,
    pub app_state: Arc<AppState>,
    pub event_sink: EventSink,
    pub task_group: TaskGroup,
    http_client: reqwest::Client,
    bg_refresh_lock: Arc<UpdateMerge>,
}

impl Communities {
    pub async fn init(
        app_state: Arc<AppState>,
        event_sink: EventSink,
        task_group: TaskGroup,
    ) -> Self {
        let http_client = reqwest::Client::new();

        let joined_communities = app_state
            .with_read_lock(|state| state.joined_communities.clone())
            .await
            .into_iter()
            .map(|(invite, info)| async {
                (
                    invite.clone(),
                    Community::from_local_meta(
                        invite,
                        info,
                        app_state.clone(),
                        event_sink.clone(),
                        http_client.clone(),
                    ),
                )
            });

        let communities = Arc::new(Mutex::new(
            futures::future::join_all(joined_communities)
                .await
                .into_iter()
                .collect::<BTreeMap<_, _>>(),
        ));

        let this = Self {
            communities,
            app_state,
            event_sink,
            task_group,
            http_client: reqwest::Client::new(),
            bg_refresh_lock: Default::default(),
        };

        this.refresh_metas_in_background();
        this
    }

    pub async fn community_preview(&self, invite_code: &str) -> anyhow::Result<RpcCommunity> {
        Community::preview(invite_code, self.http_client.clone())
            .await
            .map(|json| RpcCommunity {
                invite_code: invite_code.to_owned(),
                name: json.name,
                version: json.version,
                meta: json.meta,
            })
    }

    pub async fn join_community(&self, invite_code: &str) -> anyhow::Result<RpcCommunity> {
        let community = Community::join(
            invite_code,
            self.app_state.clone(),
            self.event_sink.clone(),
            self.http_client.clone(),
        )
        .await?;
        let meta = community.meta.read().await.clone();
        let rpc_community = RpcCommunity {
            invite_code: invite_code.to_owned(),
            name: meta.name.clone(),
            version: meta.version,
            meta: meta.meta.clone(),
        };

        {
            // Verify that community has not already been joined
            let mut communities = self.communities.lock().await;
            if communities.contains_key(invite_code) {
                bail!("Community with invite code {} already joined", invite_code);
            }

            // Write to memory
            communities.insert(invite_code.to_owned(), community);
        }

        // Write to AppState
        self.app_state
            .with_write_lock(|state| {
                state
                    .joined_communities
                    .insert(invite_code.to_owned(), CommunityInfo { meta: meta.clone() });
            })
            .await?;

        Ok(rpc_community)
    }

    pub async fn leave_community(&self, invite_code: &str) -> anyhow::Result<()> {
        // Update memory, verifying that community has already been joined
        if self.communities.lock().await.remove(invite_code).is_none() {
            bail!("Community with invite code {invite_code} must already be joined");
        }

        // Update AppState
        self.app_state
            .with_write_lock(|state| {
                state.joined_communities.remove(invite_code);
            })
            .await?;
        Ok(())
    }

    pub async fn list_communities(&self) -> anyhow::Result<Vec<RpcCommunity>> {
        let communities = self.communities.lock().await.clone();
        let read_futs = communities.iter().map(|(invite_code, community)| async {
            let meta = community.meta.read().await.clone();
            RpcCommunity {
                invite_code: invite_code.to_owned(),
                name: meta.name,
                version: meta.version,
                meta: meta.meta,
            }
        });
        Ok(futures::future::join_all(read_futs).await)
    }

    pub fn refresh_metas_in_background(&self) {
        let this = self.clone();
        self.task_group
            .spawn_cancellable("Communities::refresh_metas_in_background", async move {
                this.bg_refresh_lock
                    .merge(async {
                        let communities = this.communities.lock().await.clone();
                        futures::future::join_all(communities.values().map(|c| c.refresh_meta()))
                            .await;
                        Ok::<_, Infallible>(())
                    })
                    .await
                    .unwrap();
            });
    }
}

/// Community invite codes are bech32m encoded with the human-readable part
/// being "fedi:community". The decoded data is actually a json blob that
/// follows this schema.
#[derive(Debug, Serialize, Deserialize)]
pub struct CommunityInvite {
    pub community_meta_url: String,
}

impl FromStr for CommunityInvite {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let invite_code = s.to_lowercase();

        // TODO shaurya ok to ignore bech32 variant here?
        let (hrp, data, _) = bech32::decode(&invite_code)?;
        if hrp != COMMUNITY_INVITE_CODE_HRP {
            bail!("Unexpected hrp: {hrp}");
        }

        let decoded = Vec::from_base32(&data)?;
        let decoded_str = String::from_utf8(decoded)?;
        Ok(serde_json::from_str(&decoded_str)?)
    }
}

/// When fetching the Community's JSON file and deserializing it, we expect the
/// name, and version to always be there. All other fields are encapsulated in
/// the "meta" map and the front-end can decide how best to utilize them.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CommunityJson {
    pub name: String,
    pub version: u32,
    #[serde(flatten)]
    pub meta: BTreeMap<String, String>,
}

/// We think of a Community as a Federation without a wallet (fedimint-client).
/// So a Community affords all the functionality that comes from the root seed
/// such as chat, mods, npub-related features.
#[derive(Clone)]
pub struct Community {
    pub invite_code: String,
    /// Meta is an RwLock since most of the time we'll be reading it but
    /// occasionally we might update it if the remote data changes.
    pub meta: Arc<RwLock<CommunityJson>>,
    app_state: Arc<AppState>,
    event_sink: EventSink,
    http_client: reqwest::Client,
}

impl Community {
    /// Decodes the invite code and fetches the community's JSON file.
    pub async fn preview(
        invite_code: &str,
        http_client: reqwest::Client,
    ) -> anyhow::Result<CommunityJson> {
        let community_invite = CommunityInvite::from_str(invite_code)?;

        // Retry the network request closure with backoff and an overall timeout of one
        // minute
        fedimint_core::task::timeout(
            Duration::from_secs(60),
            fedimint_core::util::retry(
                "fetch community meta",
                FibonacciBackoff::default()
                    .with_min_delay(Duration::from_millis(100))
                    .with_max_delay(Duration::from_secs(3))
                    .with_max_times(usize::MAX)
                    .with_jitter(),
                || {
                    fetch_community_meta_json(
                        http_client.clone(),
                        community_invite.community_meta_url.clone(),
                    )
                },
            ),
        )
        .await?
    }

    /// Decodes the invite code and fetches the community's JSON file. Then
    /// constructs a Community object and returns it.
    pub async fn join(
        invite_code: &str,
        app_state: Arc<AppState>,
        event_sink: EventSink,
        http_client: reqwest::Client,
    ) -> anyhow::Result<Self> {
        Ok(Community {
            invite_code: invite_code.to_owned(),
            meta: RwLock::new(Self::preview(invite_code, http_client.clone()).await?).into(),
            app_state,
            event_sink,
            http_client,
        })
    }

    /// Uses the provided CommunityJson meta to construct a Community object and
    /// returns it.
    pub fn from_local_meta(
        invite_code: String,
        info: CommunityInfo,
        app_state: Arc<AppState>,
        event_sink: EventSink,
        http_client: reqwest::Client,
    ) -> Self {
        Community {
            invite_code,
            meta: RwLock::new(info.meta).into(),
            app_state,
            event_sink,
            http_client,
        }
    }

    /// Re-fetch from network the metadata for this community. If any properties
    /// have changed, send an event.
    async fn refresh_meta(&self) {
        let meta = self.meta.read().await.clone();

        match Self::preview(&self.invite_code, self.http_client.clone()).await {
            Ok(new_meta) if new_meta != meta => {
                *self.meta.write().await = new_meta.clone();
                let _ = self
                    .app_state
                    .with_write_lock(|state| {
                        state
                            .joined_communities
                            .insert(self.invite_code.clone(), CommunityInfo { meta: new_meta })
                    })
                    .await;
                self.event_sink
                    .typed_event(&Event::community_metadata_updated(RpcCommunity {
                        invite_code: self.invite_code.clone(),
                        name: meta.name,
                        version: meta.version,
                        meta: meta.meta,
                    }));
            }
            Ok(_) => (),
            Err(e) => info!(%e, "Failed to refresh communtiy meta for {}", self.invite_code),
        }
    }
}

async fn fetch_community_meta_json(
    http_client: reqwest::Client,
    community_meta_url: String,
) -> anyhow::Result<CommunityJson> {
    Ok(fedimint_core::task::timeout(
        Duration::from_secs(5),
        http_client.get(community_meta_url).send(),
    )
    .await
    .context(ErrorCode::Timeout)??
    .json::<CommunityJson>()
    .await
    .map_err(|e| ErrorCode::InvalidJson(e.to_string()))?)
}
