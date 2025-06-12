use serde::{Deserialize, Serialize};

/// FediGiftTransferMeta is serialized as json into meta field of spv2 transfer
#[derive(Serialize, Deserialize, Clone, Debug)]
struct FediGiftTransferMeta {
    kind: FediGiftTransferMetaMarker,
}

#[derive(Serialize, Deserialize, Clone, Debug, Copy)]
enum FediGiftTransferMetaMarker {
    FediGift,
}

impl From<&'_ FediGiftTransferMeta> for Vec<u8> {
    fn from(value: &FediGiftTransferMeta) -> Self {
        serde_json::to_vec(value).unwrap()
    }
}

impl<'a> TryFrom<&'a [u8]> for FediGiftTransferMeta {
    type Error = serde_json::Error;

    fn try_from(value: &'a [u8]) -> Result<Self, Self::Error> {
        serde_json::from_slice(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fedi_gift_repr() {
        let gift = FediGiftTransferMeta {
            kind: FediGiftTransferMetaMarker::FediGift,
        };
        assert_eq!(Vec::from(&gift), br#"{"kind":"FediGift"}"#);
    }
}
