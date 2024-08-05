mod api;
mod client;
use std::collections::BTreeMap;

pub use client::*;
pub use fedi_social_common::*;
use fedimint_client::module::init::{ClientModuleInit, ClientModuleInitArgs};
use fedimint_client::module::recovery::NoModuleBackup;
use fedimint_client::module::ClientModule;
use fedimint_client::sm::{DynState, State, StateTransition};
use fedimint_client::DynGlobalClientContext;
use fedimint_core::core::{IntoDynInstance, ModuleInstanceId, OperationId};
use fedimint_core::db::{DatabaseTransaction, DatabaseVersion};
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::module::{ApiVersion, ModuleInit, MultiApiVersion};
use fedimint_core::{apply, async_trait_maybe_send};

#[derive(Debug, Clone)]
pub struct FediSocialClientInit;

#[apply(async_trait_maybe_send!)]
impl ModuleInit for FediSocialClientInit {
    type Common = FediSocialCommonGen;

    // No client-side database for social recovery
    async fn dump_database(
        &self,
        _dbtx: &mut DatabaseTransaction<'_>,
        _prefix_names: Vec<String>,
    ) -> Box<dyn Iterator<Item = (String, Box<dyn erased_serde::Serialize + Send>)> + '_> {
        Box::new(BTreeMap::new().into_iter())
    }

    const DATABASE_VERSION: DatabaseVersion = DatabaseVersion(0);
}

#[apply(async_trait_maybe_send!)]
impl ClientModuleInit for FediSocialClientInit {
    type Module = FediSocialClientModule;

    fn supported_api_versions(&self) -> MultiApiVersion {
        MultiApiVersion::try_from_iter([ApiVersion { major: 0, minor: 0 }])
            .expect("no version conficts")
    }

    async fn init(&self, _args: &ClientModuleInitArgs<Self>) -> anyhow::Result<Self::Module> {
        Ok(FediSocialClientModule {})
    }
}

#[derive(Debug)]
pub struct FediSocialClientModule {}

impl ClientModule for FediSocialClientModule {
    type Common = FediSocialModuleTypes;
    type ModuleStateMachineContext = ();
    type States = FediSocialClientStates;
    type Init = FediSocialClientInit;
    type Backup = NoModuleBackup;

    fn context(&self) -> Self::ModuleStateMachineContext {}

    fn input_amount(
        &self,
        _input: &<Self::Common as fedimint_core::module::ModuleCommon>::Input,
    ) -> Option<fedimint_core::module::TransactionItemAmount> {
        unreachable!("FediSocial does not have any inputs")
    }

    fn output_amount(
        &self,
        _output: &<Self::Common as fedimint_core::module::ModuleCommon>::Output,
    ) -> Option<fedimint_core::module::TransactionItemAmount> {
        unreachable!("FediSocial does not have any outputs")
    }
}

#[derive(Debug, Clone, Eq, PartialEq, Decodable, Encodable, Hash)]
pub enum FediSocialClientStates {}

impl IntoDynInstance for FediSocialClientStates {
    type DynType = DynState;

    fn into_dyn(self, instance_id: ModuleInstanceId) -> Self::DynType {
        DynState::from_typed(instance_id, self)
    }
}

impl State for FediSocialClientStates {
    type ModuleContext = ();

    fn transitions(
        &self,
        _context: &Self::ModuleContext,
        _global_context: &DynGlobalClientContext,
    ) -> Vec<StateTransition<Self>> {
        unreachable!("FediSocial does not have any state machines")
    }

    fn operation_id(&self) -> OperationId {
        unreachable!("FediSocial does not have any state machines")
    }
}
