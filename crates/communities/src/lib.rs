use std::collections::BTreeMap;
use std::convert::Infallible;
use std::ops::Not;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, bail};
use api_types::invoice_generator::FirstCommunityInviteCodeState;
use fedimint_core::task::TaskGroup;
use fedimint_core::util::backoff_util::aggressive_backoff;
use fedimint_core::util::update_merge::UpdateMerge;
use nostril::Nostril;
use rpc_types::communities::{CommunityInvite, RpcCommunity};
use rpc_types::error::ErrorCode;
use rpc_types::event::{Event, EventSink, TypedEventExt};
use runtime::bridge_runtime::Runtime;
use runtime::constants::FEDI_GIFT_EXCLUDED_COMMUNITIES;
use runtime::storage::AppState;
use runtime::storage::state::{CommunityInfo, CommunityJson};
use tokio::sync::{Mutex, RwLock};
use tracing::{error, info};

/// Communities is a coordinator-like struct that encapsulates all state and
/// logic related to the functionality of communities. The Bridge struct
/// contains a Communities struct and it delegates all communities-related calls
/// to its Communities struct.
pub struct Communities {
    pub communities: Mutex<BTreeMap<String, Community>>,
    pub nostril: Arc<Nostril>,
    pub app_state: AppState,
    pub event_sink: EventSink,
    pub task_group: TaskGroup,
    http_client: reqwest::Client,
    bg_refresh_lock: UpdateMerge,
}

impl Communities {
    pub async fn init(runtime: Arc<Runtime>, nostril: Arc<Nostril>) -> Arc<Self> {
        let http_client = reqwest::Client::new();

        let joined_communities = runtime
            .app_state
            .with_read_lock(|state| state.joined_communities.clone())
            .await
            .into_iter()
            .filter_map(|(invite, info)| {
                let community_load_res = Community::from_local_meta(
                    &invite,
                    info,
                    runtime.app_state.clone(),
                    runtime.event_sink.clone(),
                    http_client.clone(),
                    nostril.clone(),
                );
                match community_load_res {
                    Ok(community) => Some((invite, community)),
                    Err(e) => {
                        error!(%invite, ?e, "Community failed to load, this shouldn't happen");
                        None
                    }
                }
            })
            .collect::<BTreeMap<_, _>>();

        let this = Arc::new(Self {
            communities: Mutex::new(joined_communities),
            nostril,
            app_state: runtime.app_state.clone(),
            event_sink: runtime.event_sink.clone(),
            task_group: runtime.task_group.clone(),
            http_client: reqwest::Client::new(),
            bg_refresh_lock: Default::default(),
        });

        this.refresh_metas_in_background();
        this
    }

    pub async fn community_preview(&self, invite_code: &str) -> anyhow::Result<RpcCommunity> {
        let community_invite = CommunityInvite::from_str(invite_code)?;
        let community_json = Community::preview(
            &community_invite,
            self.http_client.clone(),
            self.nostril.clone(),
        )
        .await?;
        Ok(RpcCommunity {
            community_invite: From::from(&community_invite),
            name: community_json.name,
            meta: community_json.meta,
        })
    }

    pub async fn join_community(&self, invite_code: &str) -> anyhow::Result<RpcCommunity> {
        let community_invite = CommunityInvite::from_str(invite_code)?;
        let community = Community::join(
            &community_invite,
            self.app_state.clone(),
            self.event_sink.clone(),
            self.http_client.clone(),
            self.nostril.clone(),
        )
        .await?;
        let meta = community.meta.read().await.clone();
        let rpc_community = RpcCommunity {
            community_invite: From::from(&community_invite),
            name: meta.name.clone(),
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

                // If this is not the default Fedi community
                if FEDI_GIFT_EXCLUDED_COMMUNITIES.contains(&invite_code).not() {
                    // And if "first community" has never been set
                    if state.first_comm_invite_code == FirstCommunityInviteCodeState::NeverSet {
                        // Then record this as the "first community"
                        state.first_comm_invite_code =
                            FirstCommunityInviteCodeState::Set(invite_code.to_owned());
                    }
                }
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

                // If we're leaving our "first community", we need to perma-clear that field
                let FirstCommunityInviteCodeState::Set(ref first_invite_code) =
                    state.first_comm_invite_code
                else {
                    return;
                };

                if first_invite_code == invite_code {
                    state.first_comm_invite_code = FirstCommunityInviteCodeState::Unset;
                }
            })
            .await?;
        Ok(())
    }

    pub async fn list_communities(&self) -> anyhow::Result<Vec<RpcCommunity>> {
        let communities = self.communities.lock().await.clone();
        let read_futs = communities.values().map(|community| async {
            let meta = community.meta.read().await.clone();
            RpcCommunity {
                community_invite: From::from(&community.community_invite),
                name: meta.name,
                meta: meta.meta,
            }
        });
        Ok(futures::future::join_all(read_futs).await)
    }

    pub fn refresh_metas_in_background(self: &Arc<Self>) {
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

/// We think of a Community as a Federation without a wallet (fedimint-client).
/// So a Community affords all the functionality that comes from the root seed
/// such as chat, mods, npub-related features.
#[derive(Clone)]
pub struct Community {
    pub community_invite: CommunityInvite,
    /// Meta is an RwLock since most of the time we'll be reading it but
    /// occasionally we might update it if the remote data changes.
    pub meta: Arc<RwLock<CommunityJson>>,
    app_state: AppState,
    event_sink: EventSink,
    http_client: reqwest::Client,
    nostril: Arc<Nostril>,
}

impl Community {
    /// Decodes the invite code and fetches the community's JSON file.
    pub async fn preview(
        community_invite: &CommunityInvite,
        http_client: reqwest::Client,
        nostril: Arc<Nostril>,
    ) -> anyhow::Result<CommunityJson> {
        match community_invite {
            CommunityInvite::V1(community_invite_v1) => {
                // Retry the network request closure with backoff and an overall timeout of one
                // minute
                fedimint_core::task::timeout(
                    Duration::from_secs(60),
                    fedimint_core::util::retry(
                        "fetch community meta",
                        aggressive_backoff(),
                        || {
                            fetch_community_meta_json(
                                http_client.clone(),
                                community_invite_v1.community_meta_url.clone(),
                            )
                        },
                    ),
                )
                .await?
            }
            CommunityInvite::V2(community_invite_v2) => {
                fedimint_core::task::timeout(
                    Duration::from_secs(60),
                    fedimint_core::util::retry(
                        "fetch community meta",
                        aggressive_backoff(),
                        || nostril.fetch_community(community_invite_v2),
                    ),
                )
                .await?
            }
        }
    }

    /// Decodes the invite code and fetches the community's JSON file. Then
    /// constructs a Community object and returns it.
    pub async fn join(
        community_invite: &CommunityInvite,
        app_state: AppState,
        event_sink: EventSink,
        http_client: reqwest::Client,
        nostril: Arc<Nostril>,
    ) -> anyhow::Result<Self> {
        let meta = RwLock::new(
            Self::preview(community_invite, http_client.clone(), nostril.clone()).await?,
        )
        .into();
        Ok(Community {
            community_invite: community_invite.clone(),
            meta,
            app_state,
            event_sink,
            http_client,
            nostril,
        })
    }

    /// Uses the provided CommunityJson meta to construct a Community object and
    /// returns it.
    pub fn from_local_meta(
        invite_code: &str,
        info: CommunityInfo,
        app_state: AppState,
        event_sink: EventSink,
        http_client: reqwest::Client,
        nostril: Arc<Nostril>,
    ) -> anyhow::Result<Self> {
        let community_invite = CommunityInvite::from_str(invite_code)?;
        Ok(Community {
            community_invite,
            meta: RwLock::new(info.meta).into(),
            app_state,
            event_sink,
            http_client,
            nostril,
        })
    }

    /// Re-fetch from network the metadata for this community. If any properties
    /// have changed, send an event.
    async fn refresh_meta(&self) {
        let meta = self.meta.read().await.clone();

        match Self::preview(
            &self.community_invite,
            self.http_client.clone(),
            self.nostril.clone(),
        )
        .await
        {
            Ok(new_meta) if new_meta != meta => {
                *self.meta.write().await = new_meta.clone();
                let _ = self
                    .app_state
                    .with_write_lock(|state| {
                        state.joined_communities.insert(
                            self.community_invite.to_string(),
                            CommunityInfo { meta: new_meta },
                        )
                    })
                    .await;
                self.event_sink
                    .typed_event(&Event::community_metadata_updated(RpcCommunity {
                        community_invite: From::from(&self.community_invite),
                        name: meta.name,
                        meta: meta.meta,
                    }));
            }
            Ok(_) => (),
            Err(e) => info!(%e, "Failed to refresh communtiy meta for {}", self.community_invite),
        }
    }
}

async fn fetch_community_meta_json(
    http_client: reqwest::Client,
    community_meta_url: String,
) -> anyhow::Result<CommunityJson> {
    let json = fedimint_core::task::timeout(
        Duration::from_secs(5),
        http_client.get(community_meta_url).send(),
    )
    .await
    .context(ErrorCode::Timeout)??
    .json::<CommunityJson>()
    .await
    .map_err(|e| ErrorCode::InvalidJson(e.to_string()))?;
    anyhow::ensure!(
        json.version == 1,
        ErrorCode::UnsupportedCommunityVersion(json.version)
    );
    Ok(json)
}

#[cfg(test)]
mod tests {
    use rpc_types::communities::CommunityInviteV1;

    use super::*;

    #[test]
    fn test_decode_community_invite() -> anyhow::Result<()> {
        let invite = "fedi:community10v3xxmmdd46ku6t5090k6et5v90h2unvygazy6r5w3c8xw309ankjum59enkjargw4382um9wf3k7mn5v4h8gtnrdakj7jtjdahxxmrpv3zx2a30x33nqvtpvejnzwry8pjrvcm9vvmnqvmyxqcxxvmx89jn2vrp89jz7unpwu386swyqqf";
        assert_eq!(
            CommunityInviteV1::from_str(invite)?.community_meta_url,
            "https://gist.githubusercontent.com/IroncladDev/4c01afe18d8d6cec703d00c3f9e50a9d/raw"
        );
        Ok(())
    }
}
