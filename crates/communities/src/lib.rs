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
use rpc_types::communities::{CommunityInvite, CommunityInviteV2, RpcCommunity};
use rpc_types::error::ErrorCode;
use rpc_types::event::{Event, EventSink, TypedEventExt};
use runtime::bridge_runtime::Runtime;
use runtime::constants::{COMMUNITY_V1_TO_V2_MIGRATION_KEY, FEDI_GIFT_EXCLUDED_COMMUNITIES};
use runtime::features::FeatureCatalog;
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
    pub feature_catalog: Arc<FeatureCatalog>,
    http_client: reqwest::Client,
    bg_refresh_lock: UpdateMerge,
}

impl Communities {
    pub async fn init(runtime: Arc<Runtime>, nostril: Arc<Nostril>) -> Arc<Self> {
        let joined_communities = runtime
            .app_state
            .with_read_lock(|state| state.joined_communities.clone())
            .await
            .into_iter()
            .filter_map(|(invite, info)| {
                let community_load_res = Community::from_local_meta(&invite, info);
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
            feature_catalog: runtime.feature_catalog.clone(),
            http_client: reqwest::Client::new(),
            bg_refresh_lock: Default::default(),
        });

        this.refresh_metas_in_background();
        this
    }

    pub async fn community_preview(&self, invite_code: &str) -> anyhow::Result<RpcCommunity> {
        let community_invite = CommunityInvite::from_str(invite_code)?;
        let (up_to_date_invite, community_json) = Community::preview(
            &community_invite,
            self.http_client.clone(),
            self.nostril.clone(),
            self.feature_catalog.community_v2_migration.is_some(),
        )
        .await?;
        Ok(RpcCommunity {
            community_invite: From::from(&up_to_date_invite),
            name: community_json.name,
            meta: community_json.meta,
        })
    }

    pub async fn join_community(&self, invite_code: &str) -> anyhow::Result<RpcCommunity> {
        let community_invite = CommunityInvite::from_str(invite_code)?;
        let community = Community::join(
            &community_invite,
            self.http_client.clone(),
            self.nostril.clone(),
            self.feature_catalog.community_v2_migration.is_some(),
        )
        .await?;
        let meta = community.meta.read().await.clone();
        let rpc_community = RpcCommunity {
            community_invite: From::from(&community.community_invite),
            name: meta.name.clone(),
            meta: meta.meta.clone(),
        };

        let up_to_date_invite_code = community.community_invite.to_string();
        {
            // Verify that community has not already been joined
            let mut communities = self.communities.lock().await;
            if communities.contains_key(&up_to_date_invite_code) {
                bail!(
                    "Community with invite code {} already joined",
                    up_to_date_invite_code
                );
            }

            // Write to memory
            communities.insert(up_to_date_invite_code.to_owned(), community);
        }

        // Write to AppState
        self.app_state
            .with_write_lock(|state| {
                state.joined_communities.insert(
                    up_to_date_invite_code.to_owned(),
                    CommunityInfo { meta: meta.clone() },
                );

                // If this is not the default Fedi community
                if FEDI_GIFT_EXCLUDED_COMMUNITIES
                    .contains(&&*up_to_date_invite_code)
                    .not()
                {
                    // And if "first community" has never been set
                    if state.first_comm_invite_code == FirstCommunityInviteCodeState::NeverSet {
                        // Then record this as the "first community"
                        state.first_comm_invite_code =
                            FirstCommunityInviteCodeState::Set(up_to_date_invite_code.to_owned());
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
                let _ = this
                    .clone()
                    .bg_refresh_lock
                    .merge(async {
                        this.refresh_metas_inner().await;
                        Ok::<_, Infallible>(())
                    })
                    .await;
            });
    }

    async fn refresh_metas_inner(self: Arc<Self>) {
        let communities = self.communities.lock().await.clone();
        let refresh_futs = communities.values().map(|c| {
            let this = self.clone();
            async move {
                let old_meta = c.meta.read().await.clone();
                let old_invite = c.community_invite.clone();

                let Ok((new_invite, new_meta)) =
                    Community::preview(
                        &old_invite,
                        this.http_client.clone(),
                        this.nostril.clone(),
                        this.feature_catalog.community_v2_migration.is_some()
                    )
                    .await
                    .inspect_err(|e| {
                        info!(%e, "Failed to refresh communtiy meta for {}", &old_invite);
                    })
                else {
                    return;
                };

                // If invite code changed, it means there was a v1->v2
                // migration. So let's update both the in-memory map as well as
                // the AppState, taking care to update the
                // first_community_invite_code properly.
                if old_invite != new_invite {
                    let mut write_lock = this.communities.lock().await;
                    let new_community = Community {
                        community_invite: new_invite.clone(),
                        meta: Arc::new(new_meta.clone().into()),
                    };
                    write_lock.insert(new_invite.to_string(), new_community);
                    write_lock.remove(&old_invite.to_string());
                    drop(write_lock);

                    let _ = this
                        .app_state
                        .with_write_lock(|state| {
                            state
                                .joined_communities
                                .insert(new_invite.to_string(), CommunityInfo { meta: new_meta.clone() });
                            state.joined_communities.remove(&old_invite.to_string());

                            // If FirstCommunityInviteCodeState is Unset or NeverSet, it remains
                            // as-is. If FirstCommunityInviteCodeState
                            // is Set, then:
                            // - if the value is old_invite, update it to new_invite
                            // - otherwise leave it unchanged
                            if matches!(&state.first_comm_invite_code, FirstCommunityInviteCodeState::Set(code) if code == &old_invite.to_string()) {
                                state.first_comm_invite_code = FirstCommunityInviteCodeState::Set(new_invite.to_string());
                            }
                        })
                        .await
                        .inspect_err(|e| {
                            info!(%e, "Error updating state for v2 migration for {}", new_invite);
                        });

                    // Emit event to front-end signaling migration
                    this.event_sink.typed_event(
                        &Event::community_migrated_to_v2(
                            old_invite.to_string(),
                            RpcCommunity {
                                community_invite: From::from(&new_invite),
                                name: new_meta.name,
                                meta: new_meta.meta
                            }
                        )
                    );
                } else if old_meta != new_meta {
                    // Otherwise if only the meta changed, update it in memory and in AppState
                    *c.meta.write().await = new_meta.clone();
                    let _ = this
                        .app_state
                        .with_write_lock(|state| {
                            state.joined_communities.insert(
                                old_invite.to_string(),
                                CommunityInfo { meta: new_meta.clone() }
                            )
                        })
                        .await
                        .inspect_err(|e| {
                            info!(%e, "Error updating state for updated meta for {}", old_invite);
                        });

                    // Emit event to front-end
                    this
                        .event_sink
                        .typed_event(&Event::community_metadata_updated(RpcCommunity {
                            community_invite: From::from(&old_invite),
                            name: new_meta.name,
                            meta: new_meta.meta,
                        }));
                }
            }
        });
        futures::future::join_all(refresh_futs).await;
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
}

impl Community {
    /// Decodes the invite code and fetches the community's JSON file.
    /// This method also returns a CommunityInvite since it's possible that
    /// fetching the meta involved a v1->v2 migration and therefore a new v2
    /// invite code should be used going forward.
    pub async fn preview(
        community_invite: &CommunityInvite,
        http_client: reqwest::Client,
        nostril: Arc<Nostril>,
        v2_migration_enabled: bool,
    ) -> anyhow::Result<(CommunityInvite, CommunityJson)> {
        // Start with a local clone for loop mutation
        let mut invite = community_invite.clone();
        loop {
            match &invite {
                CommunityInvite::V1(community_invite_v1) => {
                    // Retry the network request closure with backoff and an overall timeout of one
                    // minute
                    let v1_community_json = fedimint_core::task::timeout(
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
                    .await??;

                    // If v2 migration key is present, attempt to redirect
                    if v2_migration_enabled
                        && let Some(v2_invite_code) =
                            v1_community_json.meta.get(COMMUNITY_V1_TO_V2_MIGRATION_KEY)
                    {
                        // Parse v2 invite code and continue the loop
                        invite = CommunityInvite::V2(
                            CommunityInviteV2::from_str(v2_invite_code)
                                .context("Could not parse v2 migration invite code")?,
                        );
                        continue;
                    }
                    return Ok((invite, v1_community_json));
                }
                CommunityInvite::V2(community_invite_v2) => {
                    let v2_community_json = fedimint_core::task::timeout(
                        Duration::from_secs(60),
                        fedimint_core::util::retry(
                            "fetch community meta",
                            aggressive_backoff(),
                            || nostril.fetch_community(community_invite_v2),
                        ),
                    )
                    .await??;

                    return Ok((invite, v2_community_json));
                }
            }
        }
    }

    /// Decodes the invite code and fetches the community's JSON file. Then
    /// constructs a Community object and returns it.
    pub async fn join(
        community_invite: &CommunityInvite,
        http_client: reqwest::Client,
        nostril: Arc<Nostril>,
        v2_migration_enabled: bool,
    ) -> anyhow::Result<Self> {
        let (up_to_date_invite, community_json) =
            Self::preview(community_invite, http_client, nostril, v2_migration_enabled).await?;
        let meta = RwLock::new(community_json).into();
        Ok(Community {
            community_invite: up_to_date_invite,
            meta,
        })
    }

    /// Uses the provided CommunityJson meta to construct a Community object and
    /// returns it.
    pub fn from_local_meta(invite_code: &str, info: CommunityInfo) -> anyhow::Result<Self> {
        let community_invite = CommunityInvite::from_str(invite_code)?;
        Ok(Community {
            community_invite,
            meta: RwLock::new(info.meta).into(),
        })
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
