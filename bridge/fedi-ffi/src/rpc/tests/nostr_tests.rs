use std::collections::BTreeMap;

use rpc_types::communities::CommunityInviteV2;
use runtime::storage::state::CommunityJson;

use super::*;

pub async fn test_nostr_community_workflow(_dev_fed: DevFed) -> anyhow::Result<()> {
    let td = TestDevice::new();
    let bridge = td.bridge_full().await?;

    // No communities initially
    let our_communities = nostrListOurCommunities(bridge).await?;
    assert!(
        our_communities.is_empty(),
        "expected no communities, found {}",
        our_communities.len()
    );

    // Let's create one
    let initial_name = "Nostr Test Community".to_string();
    let initial_description = "Initial description".to_string();
    let initial_meta = BTreeMap::from([("description".to_string(), initial_description.clone())]);

    let create_payload = CommunityJson {
        name: initial_name.clone(),
        version: 2,
        meta: initial_meta.clone(),
    };
    nostrCreateCommunity(bridge, serde_json::to_string(&create_payload)?).await?;

    // We should have 1 community now
    let our_communities = nostrListOurCommunities(bridge).await?;
    assert!(
        our_communities.len() == 1,
        "expected 1 community, found {}",
        our_communities.len()
    );

    let created_community = &our_communities[0];
    assert_eq!(
        created_community.name, initial_name,
        "community name mismatch"
    );
    assert_eq!(
        created_community.meta, initial_meta,
        "community meta mismatch"
    );
    let created_invite =
        CommunityInviteV2::from_str(&created_community.community_invite.to_string())?;

    // Fetch community should also work
    let fetched_community = bridge.nostril.fetch_community(&created_invite).await?;
    assert_eq!(
        fetched_community.name, initial_name,
        "community name mismatch"
    );
    assert_eq!(
        fetched_community.meta, initial_meta,
        "community meta mismatch"
    );

    fedimint_core::task::sleep_in_test("waiting before community edit", Duration::from_secs(1))
        .await;

    // Now let's edit our community
    let new_description = "new description".to_string();
    let new_meta = BTreeMap::from([("description".to_string(), new_description.clone())]);
    let edit_payload = CommunityJson {
        name: initial_name.clone(),
        version: 2,
        meta: new_meta.clone(),
    };
    nostrEditCommunity(
        bridge,
        created_invite.community_uuid_hex.clone(),
        serde_json::to_string(&edit_payload)?,
    )
    .await?;

    // We should still only have 1 community
    let our_communities = nostrListOurCommunities(bridge).await?;
    assert!(
        our_communities.len() == 1,
        "expected 1 community, found {}",
        our_communities.len()
    );

    let created_community = &our_communities[0];
    assert_eq!(
        created_community.name, initial_name,
        "community name mismatch"
    );
    assert_eq!(created_community.meta, new_meta, "community meta mismatch");

    // Fetch community should also work (reflect new meta)
    let fetched_community = bridge.nostril.fetch_community(&created_invite).await?;
    assert_eq!(
        fetched_community.name, initial_name,
        "community name mismatch"
    );
    assert_eq!(fetched_community.meta, new_meta, "community meta mismatch");

    fedimint_core::task::sleep_in_test("waiting before community deletion", Duration::from_secs(1))
        .await;

    // Finally let's try deleting our community
    nostrDeleteCommunity(bridge, created_invite.community_uuid_hex.clone()).await?;
    let our_communities = nostrListOurCommunities(bridge).await?;
    assert!(
        our_communities.is_empty(),
        "expected no communities, found {}",
        our_communities.len()
    );

    Ok(())
}

pub async fn test_nostr_community_preview_join_leave(_dev_fed: DevFed) -> anyhow::Result<()> {
    // Creator creates community
    let community_name = "Nostr Test Community".to_string();
    let community_description = "Initial description".to_string();
    let community_meta =
        BTreeMap::from([("description".to_string(), community_description.clone())]);

    let invite_code = {
        let creator = TestDevice::new();
        let bridge = creator.bridge_full().await?;

        let create_payload = CommunityJson {
            name: community_name.clone(),
            version: 2,
            meta: community_meta.clone(),
        };
        nostrCreateCommunity(bridge, serde_json::to_string(&create_payload)?).await?;
        nostrListOurCommunities(bridge)
            .await?
            .into_iter()
            .next()
            .expect("must exist")
            .community_invite
    };

    // Joiner previews, then joins, then leaves
    let joiner = TestDevice::new();
    let bridge = joiner.bridge_full().await?;

    let preview = communityPreview(bridge, invite_code.to_string()).await?;
    assert_eq!(preview.community_invite, invite_code);
    assert_eq!(preview.name, community_name);
    assert_eq!(preview.meta, community_meta);

    // Calling preview() does not join
    assert!(bridge.communities.communities.lock().await.is_empty());
    assert!(bridge
        .runtime
        .app_state
        .with_read_lock(|state| state.joined_communities.clone())
        .await
        .is_empty());

    // Calling join() actually joins
    joinCommunity(bridge, invite_code.to_string()).await?;
    let memory_community = bridge
        .communities
        .communities
        .lock()
        .await
        .get(&invite_code.to_string())
        .unwrap()
        .clone();
    let app_state_community = bridge
        .runtime
        .app_state
        .with_read_lock(|state| state.joined_communities.clone())
        .await
        .get(&invite_code.to_string())
        .unwrap()
        .clone();
    assert!(memory_community.meta.read().await.to_owned() == app_state_community.meta);

    // Leave community
    leaveCommunity(bridge, invite_code.to_string()).await?;

    // No joined communities
    assert!(listCommunities(bridge).await?.is_empty());

    Ok(())
}
