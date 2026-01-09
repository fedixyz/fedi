use bitcoin::hashes::sha256;
use fedimint_core::BitcoinHash;
use fedimint_core::encoding::{Decodable, Encodable};

use crate::RpcEventId;

#[derive(Debug, Clone, Default)]
/// A typed value for spv2 TransferRequest::meta
pub struct Spv2TransferTxMeta {
    components: Vec<Component>,
}

#[derive(Debug, Clone, Encodable, Decodable)]
enum Component {
    SpTransferPendingStartEventIdHash(sha256::Hash),
    #[encodable_default]
    Default {
        variant: u64,
        bytes: Vec<u8>,
    },
}

impl Spv2TransferTxMeta {
    pub fn encode(&self) -> Vec<u8> {
        self.components.consensus_encode_to_vec()
    }

    pub fn decode(data: &[u8]) -> anyhow::Result<Self> {
        let components = if data.is_empty() {
            // special case for previously empty vec![] used for meta
            vec![]
        } else {
            Decodable::consensus_decode_whole(data, &Default::default())?
        };
        Ok(Self { components })
    }

    /// Make a spv2 transfer referencing a pending start event id so that the
    /// receiver can later verify it was you making the transfer
    pub fn for_sp_transfer_matrix_pending_start_event_id(event_id: &RpcEventId) -> Self {
        Self {
            components: vec![Component::SpTransferPendingStartEventIdHash(
                sha256::Hash::hash(event_id.0.as_bytes()),
            )],
        }
    }

    pub fn is_for_sp_transfer_matrix_pending_start_event_id(&self, event_id: &RpcEventId) -> bool {
        for comp in &self.components {
            match comp {
                Component::SpTransferPendingStartEventIdHash(hash) => {
                    return hash == &sha256::Hash::hash(event_id.0.as_bytes());
                }
                Component::Default { .. } => {}
            }
        }
        false
    }
}
