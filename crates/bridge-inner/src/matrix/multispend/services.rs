use std::sync::Arc;

use runtime::bridge_runtime::Runtime;

use super::completion_notification_service::CompletionNotificationService;
use super::withdrawal_service::WithdrawalService;

pub struct MultispendServices {
    pub withdrawal: WithdrawalService,
    pub completion_notification: CompletionNotificationService,
}

impl MultispendServices {
    pub fn new(runtime: Arc<Runtime>) -> Arc<Self> {
        Arc::new(Self {
            withdrawal: WithdrawalService::default(),
            completion_notification: CompletionNotificationService::new(runtime),
        })
    }
}
