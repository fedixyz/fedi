import { ResultAsync } from 'neverthrow'

import type {
    FedimintBridgeEventMap,
    MSats,
    Sats,
    UsdCents,
    bindings,
} from '../types'
import {
    FrontendMetadata,
    GuardianStatus,
    Observable,
    ObservableVec,
    ObservableVecUpdate,
    RpcAmount,
    RpcFederationId,
    RpcFeeDetails,
    RpcMediaSource,
    RpcOperationId,
    RpcPayAddressResponse,
    RpcRoomId,
    RpcStabilityPoolAccountInfo,
    RpcTimelineEventItemId,
    RpcTransaction,
    RpcTransactionListEntry,
} from '../types/bindings'
import { BridgeError, UnexpectedError } from '../utils/errors'
import { isDev } from './environment'
import { makeLog } from './log'
import { applyObservableUpdates } from './observable'

const log = makeLog('common/utils/fedimint')

export type UnsubscribeFn = () => void

export class FedimintBridge {
    constructor(
        private readonly rpc: <T = void>(
            method: string,
            payload: object,
        ) => Promise<T>,
    ) {}

    async rpcTyped<
        M extends bindings.RpcMethodNames,
        R extends bindings.RpcResponse<M>,
    >(method: M, payload: bindings.RpcPayload<M>): Promise<R> {
        return await this.rpc(method, payload)
    }

    rpcResult<
        M extends bindings.RpcMethodNames,
        R extends bindings.RpcResponse<M>,
    >(
        method: M,
        payload: bindings.RpcPayload<M>,
    ): ResultAsync<R, BridgeError | UnexpectedError> {
        return ResultAsync.fromPromise(
            this.rpc(method, payload),
            BridgeError.tryFrom,
        )
    }

    /*** RPC METHODS ***/

    async bridgeStatus() {
        return this.rpcTyped('bridgeStatus', {})
    }

    async onAppForeground() {
        return this.rpcTyped('onAppForeground', {})
    }

    async federationPreview(inviteCode: string) {
        return this.rpcTyped('federationPreview', { inviteCode })
    }

    async stabilityPoolAverageFeeRate(federationId: string, numCycles: number) {
        return this.rpcTyped('stabilityPoolAverageFeeRate', {
            federationId,
            numCycles,
        })
    }

    async stabilityPoolWithdraw(
        lockedBps: number,
        unlockedAmount: RpcAmount,
        federationId: string,
    ) {
        return this.rpcTyped<'stabilityPoolWithdraw', string>(
            'stabilityPoolWithdraw',
            { lockedBps, unlockedAmount, federationId },
        )
    }

    async stabilityPoolDepositToSeek(amount: RpcAmount, federationId: string) {
        return this.rpcTyped<'stabilityPoolDepositToSeek', string>(
            'stabilityPoolDepositToSeek',
            { amount, federationId },
        )
    }

    async stabilityPoolAccountInfo(federationId: string, forceUpdate = true) {
        return this.rpcTyped<
            'stabilityPoolAccountInfo',
            RpcStabilityPoolAccountInfo
        >('stabilityPoolAccountInfo', { federationId, forceUpdate })
    }

    async stabilityPoolAvailableLiquidity(federationId: string) {
        return this.rpcTyped<'stabilityPoolAvailableLiquidity', MSats>(
            'stabilityPoolAvailableLiquidity',
            { federationId },
        )
    }

    async stabilityPoolCycleStartPrice(federationId: string) {
        return this.rpcTyped('stabilityPoolCycleStartPrice', { federationId })
    }

    async stabilityPoolNextCycleStartTime(federationId: string) {
        return this.rpcTyped('stabilityPoolNextCycleStartTime', {
            federationId,
        })
    }

    async spv2AccountInfo(federationId: string) {
        return this.rpcTyped('spv2AccountInfo', { federationId })
    }

    async spv2NextCycleStartTime(federationId: string) {
        return this.rpcTyped('spv2NextCycleStartTime', { federationId })
    }

    async spv2DepositToSeek(
        amount: RpcAmount,
        federationId: string,
        frontendMeta: FrontendMetadata = {
            initialNotes: null,
            recipientMatrixId: null,
            senderMatrixId: null,
        },
    ) {
        return this.rpcTyped('spv2DepositToSeek', {
            amount,
            federationId,
            frontendMeta,
        })
    }

    async spv2Withdraw(
        federationId: string,
        fiatAmount: UsdCents,
        frontendMeta: FrontendMetadata = {
            initialNotes: null,
            recipientMatrixId: null,
            senderMatrixId: null,
        },
    ) {
        return this.rpcTyped('spv2Withdraw', {
            federationId,
            fiatAmount,
            frontendMeta,
        })
    }

    async spv2WithdrawAll(
        federationId: string,
        frontendMeta: FrontendMetadata = {
            initialNotes: null,
            recipientMatrixId: null,
            senderMatrixId: null,
        },
    ) {
        return this.rpcTyped('spv2WithdrawAll', { federationId, frontendMeta })
    }

    async spv2AverageFeeRate(federationId: string, numCycles: number) {
        return this.rpcTyped('spv2AverageFeeRate', {
            federationId,
            numCycles,
        })
    }

    async spv2AvailableLiquidity(federationId: string) {
        return this.rpcTyped('spv2AvailableLiquidity', { federationId })
    }

    async listTransactions(
        federationId: string,
        startTime?: number,
        limit?: number,
    ) {
        return this.rpcTyped<'listTransactions', RpcTransactionListEntry[]>(
            'listTransactions',
            {
                federationId,
                startTime: startTime || null,
                limit: limit || null,
            },
        )
    }

    async getTransaction(
        federationId: RpcFederationId,
        operationId: RpcOperationId,
    ) {
        return this.rpcTyped<'getTransaction', RpcTransaction>(
            'getTransaction',
            {
                federationId,
                operationId,
            },
        )
    }

    async getGuardianStatus(federationId: string) {
        return this.rpcTyped<'getGuardianStatus', GuardianStatus[]>(
            'getGuardianStatus',
            { federationId },
        )
    }

    async updateTransactionNotes(
        transactionId: string,
        notes: string,
        federationId: string,
    ) {
        return this.rpcTyped('updateTransactionNotes', {
            federationId,
            transactionId,
            notes,
        })
    }

    async updateCachedFiatFXInfo(
        fiatCode: string,
        btcToFiatHundredths: number,
    ) {
        // FIXME: btcToFiatHundredths must be bigint to use this.rpcTyped
        return this.rpc('updateCachedFiatFXInfo', {
            fiatCode,
            btcToFiatHundredths,
        })
    }

    async joinFederation(inviteCode: string, recoverFromScratch = false) {
        return this.rpcTyped('joinFederation', {
            inviteCode,
            recoverFromScratch,
        })
    }

    async leaveFederation(federationId: string) {
        return this.rpcTyped('leaveFederation', { federationId })
    }

    async fedimintVersion() {
        return this.rpcTyped('fedimintVersion', {})
    }

    async getFeatureCatalog() {
        return this.rpcTyped('getFeatureCatalog', {})
    }

    async listFederations() {
        return this.rpcTyped('listFederations', {})
    }

    async generateInvoice(
        amount: MSats,
        description: string,
        federationId: string,
        expiry: number | null = null,
        frontendMetadata: FrontendMetadata = {
            initialNotes: null,
            recipientMatrixId: null,
            senderMatrixId: null,
        },
    ) {
        return this.rpcTyped('generateInvoice', {
            amount,
            description,
            federationId,
            expiry,
            frontendMetadata,
        })
    }

    async decodeInvoice(invoice: string, federationId: string | null = null) {
        return this.rpcTyped('decodeInvoice', { invoice, federationId })
    }

    async payInvoice(invoice: string, federationId: string, notes?: string) {
        return this.rpcTyped('payInvoice', {
            invoice,
            federationId,
            frontendMetadata: {
                initialNotes: notes || null,
                recipientMatrixId: null,
                senderMatrixId: null,
            },
        })
    }

    async getPrevPayInvoiceResult(invoice: string, federationId: string) {
        return this.rpcTyped('getPrevPayInvoiceResult', {
            invoice,
            federationId,
        })
    }

    async getRecurringdLnurl(federationId: string) {
        return this.rpcTyped('getRecurringdLnurl', { federationId })
    }

    async supportsRecurringdLnurl(federationId: string) {
        return this.rpcTyped('supportsRecurringdLnurl', { federationId })
    }

    async generateAddress(
        federationId: string,
        frontendMetadata: FrontendMetadata = {
            initialNotes: null,
            recipientMatrixId: null,
            senderMatrixId: null,
        },
    ) {
        return this.rpcTyped('generateAddress', {
            federationId,
            frontendMetadata,
        })
    }

    async previewPayAddress(address: string, sats: Sats, federationId: string) {
        // FIXME: sats must be bigint to use this.rpcTyped
        return this.rpc<RpcFeeDetails>('previewPayAddress', {
            address,
            sats,
            federationId,
        })
    }

    async recheckPeginAddress(
        args: bindings.RpcPayload<'recheckPeginAddress'>,
    ) {
        return this.rpcTyped('recheckPeginAddress', args)
    }

    async payAddress(
        address: string,
        sats: Sats,
        federationId: string,
        notes?: string,
    ) {
        // FIXME: sats must be bigint to use this.rpcTyped
        return this.rpc<RpcPayAddressResponse>('payAddress', {
            address,
            sats,
            federationId,
            frontendMetadata: {
                initialNotes: notes || null,
                recipientMatrixId: null,
                senderMatrixId: null,
            },
        })
    }

    async supportsSafeOnchainDeposit(federationId: string) {
        return this.rpcTyped('supportsSafeOnchainDeposit', { federationId })
    }

    async generateEcash(
        amount: MSats,
        federationId: string,
        includeInvite = false,
        frontendMetadata: FrontendMetadata = {
            initialNotes: null,
            recipientMatrixId: null,
            senderMatrixId: null,
        },
    ) {
        return this.rpcTyped('generateEcash', {
            federationId,
            amount,
            includeInvite,
            frontendMetadata,
        })
    }

    async listFederationsPendingRejoinFromScratch() {
        return this.rpcTyped('listFederationsPendingRejoinFromScratch', {})
    }

    // Attempts to reissues ecash, can be started offline but requires
    // a connection to guardians to actually redeem the ecash.
    // Will retry in the background.
    async receiveEcash(
        ecash: string,
        federationId: string,
        frontendMetadata: FrontendMetadata = {
            initialNotes: null,
            recipientMatrixId: null,
            senderMatrixId: null,
        },
    ) {
        return await this.rpcTyped('receiveEcash', {
            federationId,
            ecash,
            frontendMetadata,
        })
    }

    // Parses ecash, works offline
    async validateEcash(ecash: string) {
        return this.rpcTyped('validateEcash', {
            ecash,
        })
    }

    async cancelEcash(ecash: string, federationId: string) {
        return this.rpcTyped('cancelEcash', {
            ecash,
            federationId,
        })
    }

    async generateReusedEcashProofs(federationId: string) {
        return this.rpcTyped('generateReusedEcashProofs', { federationId })
    }

    async signLnurlMessage(message: string, domain: string) {
        return this.rpcTyped('signLnurlMessage', {
            message,
            domain,
        })
    }

    async getNostrPubkey() {
        return this.rpcTyped('getNostrPubkey', {})
    }

    async getNostrSecret() {
        return this.rpcTyped('getNostrSecret', {})
    }

    async signNostrEvent(eventHash: string) {
        return this.rpcTyped('signNostrEvent', {
            eventHash,
        })
    }

    async nostrEncrypt(pubkey: string, plaintext: string) {
        return this.rpcTyped('nostrEncrypt', {
            pubkey,
            plaintext,
        })
    }

    async nostrDecrypt(pubkey: string, ciphertext: string) {
        return this.rpcTyped('nostrDecrypt', {
            pubkey,
            ciphertext,
        })
    }

    async nostrEncrypt04(pubkey: string, plaintext: string) {
        return this.rpcTyped('nostrEncrypt04', {
            pubkey,
            plaintext,
        })
    }

    async nostrDecrypt04(pubkey: string, ciphertext: string) {
        return this.rpcTyped('nostrDecrypt04', {
            pubkey,
            ciphertext,
        })
    }

    async nostrRateFederation(
        federationId: string,
        rating: number,
        includeInviteCode: boolean,
    ) {
        return this.rpcTyped('nostrRateFederation', {
            federationId,
            rating,
            includeInviteCode,
        })
    }

    async listGateways(federationId: string) {
        return this.rpcTyped('listGateways', { federationId })
    }

    async switchGateway(
        gatewayId: bindings.RpcPublicKey,
        federationId: string,
    ) {
        return this.rpcTyped('switchGateway', {
            federationId,
            gatewayId,
        })
    }

    async getMnemonic() {
        return this.rpcTyped('getMnemonic', {})
    }

    async checkMnemonic(mnemonic: Array<string>) {
        return this.rpcTyped('checkMnemonic', { mnemonic })
    }

    async restoreMnemonic(mnemonic: string[]) {
        return this.rpcTyped('restoreMnemonic', {
            mnemonic,
        })
    }

    // Adds a new device for an existing user.
    // Currently DISABLED in the UI.
    async onboardRegisterAsNewDevice() {
        return this.rpcTyped('onboardRegisterAsNewDevice', {})
    }

    async onboardTransferExistingDeviceRegistration(index: number) {
        return this.rpcTyped('onboardTransferExistingDeviceRegistration', {
            index,
        })
    }

    async completeOnboardingNewSeed() {
        return this.rpcTyped('completeOnboardingNewSeed', {})
    }

    async fetchRegisteredDevices() {
        return this.rpcTyped('fetchRegisteredDevices', {})
    }

    /*
     * Mocked-out social backup and recovery methods
     */

    async uploadBackupFile(videoFilePath: string, federationId: string) {
        // FIXME: for some reason rust can't read the file if it has `file://` prefix ...
        videoFilePath = videoFilePath.replace('file://', '')
        return this.rpcTyped('uploadBackupFile', {
            federationId,
            videoFilePath,
        })
    }

    async locateRecoveryFile() {
        return this.rpcTyped('locateRecoveryFile', {})
    }

    async validateRecoveryFile(path: string) {
        log.debug('backup file path', path)
        await this.rpcTyped('validateRecoveryFile', { path })
    }

    async recoveryQr() {
        return this.rpcTyped('recoveryQr', {})
    }

    async socialRecoveryApprovals() {
        return this.rpcTyped('socialRecoveryApprovals', {})
    }

    async getSensitiveLog() {
        return this.rpcTyped('getSensitiveLog', {})
    }

    async setSensitiveLog(enable: boolean) {
        return this.rpcTyped('setSensitiveLog', { enable })
    }

    async internalMarkBridgeExport() {
        return this.rpcTyped('internalMarkBridgeExport', {})
    }

    async internalExportBridgeState(path: string) {
        return this.rpcTyped('internalExportBridgeState', { path })
    }

    // `_userPublicKey` is what guardian decryption shares are threshold-encrypted to
    async approveSocialRecoveryRequest(
        recoveryId: string,
        peerId: number,
        password: string,
        federationId: string,
    ) {
        return this.rpcTyped('approveSocialRecoveryRequest', {
            recoveryId,
            peerId,
            password,
            federationId,
        })
    }

    async socialRecoveryDownloadVerificationDoc(
        recoveryId: string,
        federationId: string,
        peerId: number,
    ) {
        return this.rpcTyped('socialRecoveryDownloadVerificationDoc', {
            federationId,
            recoveryId,
            peerId,
        })
    }

    async completeSocialRecovery() {
        return this.rpcTyped('completeSocialRecovery', {})
    }

    async cancelSocialRecovery() {
        return this.rpcTyped('cancelSocialRecovery', {})
    }

    /*** MATRIX ***/

    async matrixSendAttachment(
        args: bindings.RpcPayload<'matrixSendAttachment'>,
    ) {
        return this.rpcTyped('matrixSendAttachment', args)
    }

    async matrixEditMessage(
        roomId: RpcRoomId,
        eventId: RpcTimelineEventItemId,
        newContent: string,
    ) {
        return this.rpcTyped('matrixEditMessage', {
            roomId,
            eventId,
            newContent,
        })
    }

    async matrixDeleteMessage(
        roomId: RpcRoomId,
        eventId: RpcTimelineEventItemId,
        reason: string | null,
    ) {
        return this.rpcTyped('matrixDeleteMessage', { roomId, eventId, reason })
    }

    async matrixDownloadFile(path: string, mediaSource: RpcMediaSource) {
        return this.rpcTyped('matrixDownloadFile', { path, mediaSource })
    }

    async matrixStartPoll(
        roomId: RpcRoomId,
        question: string,
        answers: Array<string>,
        isMultipleChoice: boolean,
        isDisclosed: boolean,
    ) {
        return this.rpcTyped('matrixStartPoll', {
            roomId,
            question,
            answers,
            isMultipleChoice,
            isDisclosed,
        })
    }

    async matrixSendReply(
        roomId: RpcRoomId,
        replyToEventId: string,
        message: string,
    ) {
        return this.rpcTyped('matrixSendReply', {
            roomId,
            replyToEventId,
            message,
        })
    }

    async matrixEndPoll(roomId: RpcRoomId, pollStartId: string) {
        return this.rpcTyped('matrixEndPoll', { roomId, pollStartId })
    }

    async matrixRespondToPoll(
        roomId: RpcRoomId,
        pollStartId: string,
        answerIds: Array<string>,
    ) {
        return this.rpcTyped('matrixRespondToPoll', {
            roomId,
            pollStartId,
            answerIds,
        })
    }

    async matrixInitializeStatus(
        args: bindings.RpcPayload<'matrixInitializeStatus'>,
    ) {
        return this.rpcTyped('matrixInitializeStatus', args)
    }

    async matrixGetAccountSession(
        args: bindings.RpcPayload<'matrixGetAccountSession'>,
    ) {
        return this.rpcTyped('matrixGetAccountSession', args)
    }

    async matrixPublicRoomInfo(
        args: bindings.RpcPayload<'matrixPublicRoomInfo'>,
    ) {
        return this.rpcTyped('matrixPublicRoomInfo', args)
    }

    async matrixRoomPreviewContent(
        args: bindings.RpcPayload<'matrixRoomPreviewContent'>,
    ) {
        return this.rpcTyped('matrixRoomPreviewContent', args)
    }

    async matrixRoomList(args: bindings.RpcPayload<'matrixRoomList'>) {
        return this.rpcTyped('matrixRoomList', args)
    }

    async matrixRoomTimelineItems(
        args: bindings.RpcPayload<'matrixRoomTimelineItems'>,
    ) {
        return this.rpcTyped('matrixRoomTimelineItems', args)
    }

    async matrixRoomTimelineItemsPaginateBackwards(
        args: bindings.RpcPayload<'matrixRoomTimelineItemsPaginateBackwards'>,
    ) {
        return this.rpcTyped('matrixRoomTimelineItemsPaginateBackwards', args)
    }

    async matrixRoomObserveTimelineItemsPaginateBackwards(
        args: bindings.RpcPayload<'matrixRoomObserveTimelineItemsPaginateBackwards'>,
    ) {
        return this.rpcTyped(
            'matrixRoomObserveTimelineItemsPaginateBackwards',
            args,
        )
    }

    async matrixSendMessage(args: bindings.RpcPayload<'matrixSendMessage'>) {
        return this.rpcTyped('matrixSendMessage', args)
    }

    async matrixSendMessageJson(
        args: bindings.RpcPayload<'matrixSendMessageJson'>,
    ) {
        return this.rpcTyped('matrixSendMessageJson', args)
    }

    async matrixRoomCreate(args: bindings.RpcPayload<'matrixRoomCreate'>) {
        return this.rpcTyped('matrixRoomCreate', args)
    }

    async matrixRoomCreateOrGetDm(
        args: bindings.RpcPayload<'matrixRoomCreateOrGetDm'>,
    ) {
        return this.rpcTyped('matrixRoomCreateOrGetDm', args)
    }

    async matrixRoomJoin(args: bindings.RpcPayload<'matrixRoomJoin'>) {
        return this.rpcTyped('matrixRoomJoin', args)
    }

    async matrixRoomJoinPublic(
        args: bindings.RpcPayload<'matrixRoomJoinPublic'>,
    ) {
        return this.rpcTyped('matrixRoomJoinPublic', args)
    }

    async matrixRoomLeave(args: bindings.RpcPayload<'matrixRoomLeave'>) {
        return this.rpcTyped('matrixRoomLeave', args)
    }

    async matrixIgnoreUser(args: bindings.RpcPayload<'matrixIgnoreUser'>) {
        return this.rpcTyped('matrixIgnoreUser', args)
    }

    async matrixListIgnoredUsers(
        args: bindings.RpcPayload<'matrixListIgnoredUsers'>,
    ) {
        return this.rpcTyped('matrixListIgnoredUsers', args)
    }

    async matrixUnignoreUser(args: bindings.RpcPayload<'matrixUnignoreUser'>) {
        return this.rpcTyped('matrixUnignoreUser', args)
    }

    async matrixRoomKickUser(args: bindings.RpcPayload<'matrixRoomKickUser'>) {
        return this.rpcTyped('matrixRoomKickUser', args)
    }

    async matrixRoomBanUser(args: bindings.RpcPayload<'matrixRoomBanUser'>) {
        return this.rpcTyped('matrixRoomBanUser', args)
    }

    async matrixRoomUnbanUser(
        args: bindings.RpcPayload<'matrixRoomUnbanUser'>,
    ) {
        return this.rpcTyped('matrixRoomUnbanUser', args)
    }

    async matrixRoomObserveInfo(
        args: bindings.RpcPayload<'matrixRoomObserveInfo'>,
    ) {
        return this.rpcTyped('matrixRoomObserveInfo', args)
    }

    async matrixRoomInviteUserById(
        args: bindings.RpcPayload<'matrixRoomInviteUserById'>,
    ) {
        return this.rpcTyped('matrixRoomInviteUserById', args)
    }

    async matrixRoomSetName(args: bindings.RpcPayload<'matrixRoomSetName'>) {
        return this.rpcTyped('matrixRoomSetName', args)
    }

    async matrixRoomSetTopic(args: bindings.RpcPayload<'matrixRoomSetTopic'>) {
        return this.rpcTyped('matrixRoomSetTopic', args)
    }

    async matrixRoomGetMembers(
        args: bindings.RpcPayload<'matrixRoomGetMembers'>,
    ) {
        return this.rpcTyped('matrixRoomGetMembers', args)
    }

    async matrixRoomGetPowerLevels(
        args: bindings.RpcPayload<'matrixRoomGetPowerLevels'>,
    ) {
        return this.rpcTyped('matrixRoomGetPowerLevels', args)
    }

    async matrixRoomSetPowerLevels(
        args: bindings.RpcPayload<'matrixRoomSetPowerLevels'>,
    ) {
        return this.rpcTyped('matrixRoomSetPowerLevels', args)
    }

    async matrixUserDirectorySearch(
        args: bindings.RpcPayload<'matrixUserDirectorySearch'>,
    ) {
        return this.rpcTyped('matrixUserDirectorySearch', args)
    }

    async matrixUserProfile(args: bindings.RpcPayload<'matrixUserProfile'>) {
        return this.rpcTyped('matrixUserProfile', args)
    }

    async matrixSetDisplayName(
        args: bindings.RpcPayload<'matrixSetDisplayName'>,
    ) {
        return this.rpcTyped('matrixSetDisplayName', args)
    }

    async matrixSetAvatarUrl(args: bindings.RpcPayload<'matrixSetAvatarUrl'>) {
        return this.rpcTyped('matrixSetAvatarUrl', args)
    }

    async matrixUploadMedia(args: bindings.RpcPayload<'matrixUploadMedia'>) {
        return this.rpcTyped('matrixUploadMedia', args)
    }

    async matrixObserveSyncIndicator(
        args: bindings.RpcPayload<'matrixObserveSyncIndicator'>,
    ) {
        return this.rpcTyped('matrixObserveSyncIndicator', args)
    }

    async matrixRoomSendReceipt(
        args: bindings.RpcPayload<'matrixRoomSendReceipt'>,
    ) {
        return this.rpcTyped('matrixRoomSendReceipt', args)
    }

    async matrixRoomMarkAsUnread(
        args: bindings.RpcPayload<'matrixRoomMarkAsUnread'>,
    ) {
        return this.rpcTyped('matrixRoomMarkAsUnread', args)
    }

    async matrixSetPusher(args: bindings.RpcPayload<'matrixSetPusher'>) {
        return this.rpcTyped('matrixSetPusher', args)
    }

    async matrixRoomGetNotificationMode(
        args: bindings.RpcPayload<'matrixRoomGetNotificationMode'>,
    ) {
        return this.rpcTyped('matrixRoomGetNotificationMode', args)
    }

    async matrixRoomSetNotificationMode(
        args: bindings.RpcPayload<'matrixRoomSetNotificationMode'>,
    ) {
        return this.rpcTyped('matrixRoomSetNotificationMode', args)
    }

    async matrixObserverCancel(
        args: bindings.RpcPayload<'matrixObservableCancel'>,
    ) {
        return this.rpcTyped('matrixObservableCancel', args)
    }

    async dumpDb(args: bindings.RpcPayload<'dumpDb'>) {
        return this.rpcTyped('dumpDb', args)
    }

    async getAccruedOutstandingFediFeesPerTXType(
        args: bindings.RpcPayload<'getAccruedOutstandingFediFeesPerTXType'>,
    ) {
        return this.rpcTyped('getAccruedOutstandingFediFeesPerTXType', args)
    }

    async getAccruedPendingFediFeesPerTXType(
        args: bindings.RpcPayload<'getAccruedPendingFediFeesPerTXType'>,
    ) {
        return this.rpcTyped('getAccruedPendingFediFeesPerTXType', args)
    }

    async matrixGetMediaPreview(
        args: bindings.RpcPayload<'matrixGetMediaPreview'>,
    ) {
        return this.rpcTyped('matrixGetMediaPreview', args)
    }

    /*** MULTISPEND RPCs ***/

    // Group active/pending_invitation/inactive status
    async matrixObserveMultispendGroup(
        args: bindings.RpcPayload<'matrixObserveMultispendGroup'>,
    ) {
        return this.rpcTyped('matrixObserveMultispendGroup', args)
    }

    async matrixObserveMultispendEventData(
        args: bindings.RpcPayload<'matrixObserveMultispendEventData'>,
    ) {
        return this.rpcTyped('matrixObserveMultispendEventData', args)
    }

    async matrixSendMultispendGroupInvitation(
        args: bindings.RpcPayload<'matrixSendMultispendGroupInvitation'>,
    ) {
        return this.rpcTyped('matrixSendMultispendGroupInvitation', args)
    }

    async matrixApproveMultispendGroupInvitation(
        args: bindings.RpcPayload<'matrixApproveMultispendGroupInvitation'>,
    ) {
        return this.rpcTyped('matrixApproveMultispendGroupInvitation', args)
    }

    async matrixRejectMultispendGroupInvitation(
        args: bindings.RpcPayload<'matrixRejectMultispendGroupInvitation'>,
    ) {
        return this.rpcTyped('matrixRejectMultispendGroupInvitation', args)
    }

    async matrixCancelMultispendGroupInvitation(
        args: bindings.RpcPayload<'matrixCancelMultispendGroupInvitation'>,
    ) {
        return this.rpcTyped('matrixCancelMultispendGroupInvitation', args)
    }

    // Active group status (MUST be in federation to use)
    async matrixMultispendAccountInfo(
        args: bindings.RpcPayload<'matrixMultispendAccountInfo'>,
    ) {
        return this.rpcTyped('matrixMultispendAccountInfo', args)
    }

    async matrixMultispendListEvents(
        args: bindings.RpcPayload<'matrixMultispendListEvents'>,
    ) {
        return this.rpcTyped('matrixMultispendListEvents', args)
    }

    async matrixMultispendEventData(
        args: bindings.RpcPayload<'matrixMultispendEventData'>,
    ) {
        return this.rpcTyped('matrixMultispendEventData', args)
    }

    // Matrix observe multispnd group events ()
    // observe multispend event data

    async matrixMultispendDeposit(
        args: bindings.RpcPayload<'matrixMultispendDeposit'>,
    ) {
        return this.rpcTyped('matrixMultispendDeposit', args)
    }

    async matrixSendMultispendWithdrawalRequest(
        args: bindings.RpcPayload<'matrixSendMultispendWithdrawalRequest'>,
    ) {
        return this.rpcTyped('matrixSendMultispendWithdrawalRequest', args)
    }

    async matrixSendMultispendWithdrawalApprove(
        args: bindings.RpcPayload<'matrixSendMultispendWithdrawalApprove'>,
    ) {
        return this.rpcTyped('matrixSendMultispendWithdrawalApprove', args)
    }

    async matrixSendMultispendWithdrawalReject(
        args: bindings.RpcPayload<'matrixSendMultispendWithdrawalReject'>,
    ) {
        return this.rpcTyped('matrixSendMultispendWithdrawalReject', args)
    }

    /*** COMMUNITIES RPCs ***/

    async communityPreview(args: bindings.RpcPayload<'communityPreview'>) {
        return this.rpcTyped('communityPreview', args)
    }

    async joinCommunity(args: bindings.RpcPayload<'joinCommunity'>) {
        return this.rpcTyped('joinCommunity', args)
    }

    async leaveCommunity(args: bindings.RpcPayload<'leaveCommunity'>) {
        return this.rpcTyped('leaveCommunity', args)
    }

    async listCommunities(args: bindings.RpcPayload<'listCommunities'>) {
        return this.rpcTyped('listCommunities', args)
    }

    /*** EVIL RPCs ***/

    async evilSpamInvoices(args: bindings.RpcPayload<'evilSpamInvoices'>) {
        return this.rpcTyped('evilSpamInvoices', args)
    }

    async evilSpamAddress(args: bindings.RpcPayload<'evilSpamAddress'>) {
        return this.rpcTyped('evilSpamAddress', args)
    }
    /*** BRIDGE EVENTS ***/

    private listeners = new Map<string, Array<(data: unknown) => void>>()
    private observableHandlers = new Map<
        number,
        (update: bindings.ObservableUpdate<unknown>) => void
    >()

    emit(eventType: string, data: unknown) {
        if (eventType == 'observableUpdate') {
            const observableData = data as bindings.ObservableUpdate<unknown>
            const handler = this.observableHandlers.get(observableData.id)
            if (handler) {
                handler(observableData)
                if (isDev())
                    log.debug(
                        'Received observable update',
                        JSON.stringify(observableData),
                    )
            } else {
                log.warn(
                    'Received observable update without associated observer handler',
                    JSON.stringify(observableData),
                )
            }
        }
        const listeners = this.listeners.get(eventType) || []
        listeners.forEach(listener => listener(data))
    }

    private observableId = 0

    // don't try to change this to async, you will introduce new bugs.
    // sync code in javascript restricts anything else from happening concurrently.
    subscribeObservable<T, U>(
        init: (id: number) => Promise<Observable<T>>,
        // TODO: consider returning a promise from callbacks
        initCallback: (value: T) => void,
        updateCallback: (value: U) => void,
    ): UnsubscribeFn {
        const id = this.observableId++
        let initCompleted = false
        // prevent calling the callback if unsubscribe was called
        let cancelled = false
        let pendingUpdates: U[] = []

        const initPromise = init(id)
            .then(value => {
                if (cancelled) {
                    return
                }
                if (id !== value.id) {
                    log.warn('Observable ID mismatch', {
                        id,
                        valueId: value.id,
                    })
                    return
                }
                initCallback(value.initial)
                for (const update of pendingUpdates) {
                    updateCallback(update)
                }
                initCompleted = true
                pendingUpdates = []
            })
            .catch(err => {
                log.error('subscribeObservable init error', { id, err })
            })

        const unsubscribe = () => {
            cancelled = true
            const deleted = this.observableHandlers.delete(id)
            if (!deleted) {
                log.warn('Tried to delete a handler that does not exist')
            }
            initPromise.then(() => {
                // no need to await, it will happen in background
                this.matrixObserverCancel({ observableId: id })
            })
        }

        let nextUpdateIndex = 0
        this.observableHandlers.set(
            id,
            (update: bindings.ObservableUpdate<unknown>) => {
                // this should never happen due to removing from observableHandlers
                // but this statement doesn't hurt.
                if (cancelled) {
                    // TODO: log a big warning here
                    log.warn('Observable update received after unsubscribe')
                    return
                }
                if (update.update_index !== nextUpdateIndex) {
                    log.warn('Observable update index mismatch', {
                        id,
                        update_index: update.update_index,
                        nextUpdateIndex,
                    })
                    // TODO: consider if we should throw here or not
                    // throw 'Got out of order observable update';
                }
                nextUpdateIndex++
                // initialization is complete
                if (initCompleted) {
                    updateCallback(update.update as U)
                } else {
                    // queue the updates to after intialization is complete
                    pendingUpdates.push(update.update as U)
                }
            },
        )

        return unsubscribe
    }

    subscribeObservableSimple<T>(
        init: (id: number) => Promise<Observable<T>>,
        callback: (value: T, isInitialUpdate: boolean) => void,
    ): UnsubscribeFn {
        return this.subscribeObservable(
            init,
            // initial callback
            (value: T) => callback(value, true),
            // update callback
            (value: T) => callback(value, false),
        )
    }

    subscribeObservableVec<T>(
        init: (id: number) => Promise<ObservableVec<T>>,
        callback: (value: T[], isInitialUpdate: boolean) => void,
    ): UnsubscribeFn {
        let value: T[] | undefined = undefined
        return this.subscribeObservable(
            init,
            initValue => {
                value = initValue
                callback(value, true)
            },
            (update: ObservableVecUpdate<T>['update']) => {
                if (value === undefined) {
                    log.warn(
                        'ObservableVec value is undefined. Likely due to a bug inside the implementation of subscribeObservable',
                    )
                    return
                }
                value = applyObservableUpdates(value, update)
                callback(value, false)
            },
        )
    }

    /**
     * Subscribe to bridge events. Returns an unsubscribe function.
     */
    addListener<K extends keyof FedimintBridgeEventMap>(
        eventType: K,
        listener: (data: FedimintBridgeEventMap[K]) => void,
    ): () => void
    addListener(
        eventType: string,
        listener: (data: unknown) => void,
    ): () => void {
        const listeners = this.listeners.get(eventType) || []
        this.listeners.set(eventType, [...listeners, listener])

        // Return a quick unsubscribe function
        return () => {
            const subscribedListeners = this.listeners.get(eventType) || []
            this.listeners.set(
                eventType,
                subscribedListeners.filter(l => l !== listener),
            )
        }
    }
}
