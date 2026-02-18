import { ResultAsync } from 'neverthrow'

import type {
    FedimintBridgeEventMap,
    MSats,
    MatrixRoom,
    Sats,
    UsdCents,
    bindings,
} from '../types'
import {
    FrontendMetadata,
    GuardianStatus,
    JSONObject,
    RpcAmount,
    RpcFederationId,
    RpcFeeDetails,
    RpcMediaSource,
    RpcMentions,
    RpcOperationId,
    RpcPayAddressResponse,
    RpcRoomId,
    RpcStabilityPoolAccountInfo,
    RpcTimelineEventItemId,
    RpcTransaction,
} from '../types/bindings'
import { BridgeError } from '../utils/errors'
import { MatrixChatClient } from './MatrixChatClient'
import { isDev } from './environment'
import { makeLog } from './log'
import { toSendMessageData } from './matrix'

const log = makeLog('common/utils/fedimint')

export type UnsubscribeFn = () => void

type ExtractStreamData<Method extends keyof bindings.RpcMethods> =
    bindings.RpcPayload<Method> extends {
        streamId: bindings.RpcStreamId<infer T>
    }
        ? T
        : never

type StreamRpcArgs<Method extends keyof bindings.RpcMethods> = Omit<
    bindings.RpcPayload<Method>,
    'streamId'
> & {
    callback: (data: ExtractStreamData<Method>) => void
}

export class FedimintBridge {
    constructor(
        private readonly rpc: <T = void>(
            method: string,
            payload: object,
        ) => Promise<T>,
    ) {}

    matrixClient: MatrixChatClient | null = null
    getMatrixClient() {
        if (!this.matrixClient) {
            this.matrixClient = new MatrixChatClient()
        }
        return this.matrixClient
    }

    async rpcTyped<
        M extends bindings.RpcMethodNames,
        R extends bindings.RpcResponse<M>,
    >(method: M, payload: bindings.RpcPayload<M>): Promise<R> {
        return await this.rpc(method, payload)
    }

    rpcResult<
        M extends bindings.RpcMethodNames,
        R extends bindings.RpcResponse<M>,
    >(method: M, payload: bindings.RpcPayload<M>): ResultAsync<R, BridgeError> {
        return ResultAsync.fromPromise(this.rpc(method, payload), e => {
            if (e instanceof BridgeError) return e

            return new BridgeError(
                {
                    errorCode: null,
                    error: 'Failed to construct BridgeError from unknown value',
                    detail: 'Failed to construct BridgeError from unknown value',
                },
                e,
            )
        })
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

    async parseInviteCode(inviteCode: string) {
        return this.rpcTyped('parseInviteCode', { inviteCode })
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

    async spv2StartFastSync(federationId: string) {
        return this.rpcTyped('spv2StartFastSync', { federationId })
    }

    async spv2OurPaymentAddress(federationId: string) {
        return this.rpcTyped('spv2OurPaymentAddress', {
            federationId,
            includeInvite: true,
        })
    }

    async spv2ParsePaymentAddress(spPaymentAddress: string) {
        return this.rpcTyped('spv2ParsePaymentAddress', {
            address: spPaymentAddress,
        })
    }

    async spv2Transfer(
        amount: UsdCents,
        accountId: string,
        federationId: string,
        notes?: string,
    ) {
        return this.rpcTyped('spv2Transfer', {
            amount,
            accountId,
            federationId,
            frontendMeta: {
                initialNotes: notes || null,
                recipientMatrixId: null,
                senderMatrixId: null,
            },
        })
    }

    async matrixSpTransferSend(
        amount: UsdCents,
        roomId: MatrixRoom['id'],
        federationId: string,
        federationInvite?: string,
    ) {
        return this.rpcTyped('matrixSpTransferSend', {
            amount,
            roomId,
            federationId,
            federationInvite: federationInvite || null,
        })
    }

    matrixSpTransferObserveState(
        args: StreamRpcArgs<'matrixSpTransferObserveState'>,
    ): UnsubscribeFn {
        return this.rpcStream('matrixSpTransferObserveState', args)
    }

    async spv2AccountInfo(federationId: string) {
        return this.rpcTyped('spv2AccountInfo', { federationId })
    }

    spv2SubscribeAccountInfo(args: StreamRpcArgs<'spv2SubscribeAccountInfo'>) {
        return this.rpcStream('spv2SubscribeAccountInfo', args)
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
        return this.rpcTyped('listTransactions', {
            federationId,
            startTime: startTime || null,
            limit: limit || null,
        })
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

    async repairWallet(federationId: string) {
        return this.rpcTyped('repairWallet', { federationId })
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
    async parseEcash(ecash: string) {
        return this.rpcTyped('parseEcash', {
            ecash,
        })
    }

    async cancelEcash(ecash: string, federationId: string) {
        return this.rpcTyped('cancelEcash', {
            ecash,
            federationId,
        })
    }

    async calculateMaxGenerateEcash(federationId: string) {
        return this.rpcTyped('calculateMaxGenerateEcash', { federationId })
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

    async guardianitoGetOrCreateBot() {
        return this.rpcTyped('guardianitoGetOrCreateBot', {})
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

    async createCommunity(communityJsonStr: string) {
        return this.rpcTyped('nostrCreateCommunity', {
            communityJsonStr,
        })
    }

    async listCreatedCommunities() {
        return this.rpcTyped('nostrListOurCommunities', {})
    }

    async editCommunity(communityHexUuid: string, newCommunityJsonStr: string) {
        return this.rpcTyped('nostrEditCommunity', {
            communityHexUuid,
            newCommunityJsonStr,
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
        guardianPassword: string,
        federationId: string,
    ) {
        return this.rpcTyped('approveSocialRecoveryRequest', {
            recoveryId,
            peerId: String(peerId),
            guardianPassword,
            federationId,
        })
    }

    async socialRecoveryDownloadVerificationDoc(
        recoveryId: string,
        federationId: string,
        peerId: number,
        guardianPassword: string,
    ) {
        return this.rpcTyped('socialRecoveryDownloadVerificationDoc', {
            federationId,
            recoveryId,
            peerId: String(peerId),
            guardianPassword,
        })
    }

    async setGuardianPassword(
        federationId: string,
        peerId: number,
        password: string,
    ) {
        return this.rpcTyped('setGuardianPassword', {
            federationId,
            peerId: String(peerId),
            guardianPassword: password,
        })
    }

    async getGuardianPassword(federationId: string, peerId: number) {
        return this.rpcTyped('getGuardianPassword', {
            federationId,
            peerId: String(peerId),
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

    // TODO: Make this match sendMessage
    async matrixEditMessage(
        roomId: RpcRoomId,
        eventId: RpcTimelineEventItemId,
        newContent: string,
        options?: { mentions?: RpcMentions | null; extra?: JSONObject },
    ) {
        return this.rpcTyped('matrixEditMessage', {
            roomId,
            eventId,
            newContent: toSendMessageData(newContent, {
                mentions: options?.mentions ?? null,
                extra: options?.extra,
            }),
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

    // TODO: Make this match sendMessage
    async matrixSendReply(
        roomId: RpcRoomId,
        replyToEventId: string,
        message: string,
        options?: { mentions?: RpcMentions | null; extra?: JSONObject },
    ) {
        return this.rpcTyped('matrixSendReply', {
            roomId,
            replyToEventId,
            data: toSendMessageData(message, {
                mentions: options?.mentions ?? null,
                extra: options?.extra,
            }),
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

    matrixInitializeStatus(
        args: StreamRpcArgs<'matrixInitializeStatus'>,
    ): UnsubscribeFn {
        return this.rpcStream('matrixInitializeStatus', args)
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

    matrixSubscribeRoomList(
        args: StreamRpcArgs<'matrixSubscribeRoomList'>,
    ): UnsubscribeFn {
        return this.rpcStream('matrixSubscribeRoomList', args)
    }

    matrixSubscribeRoomTimelineItems(
        args: StreamRpcArgs<'matrixSubscribeRoomTimelineItems'>,
    ): UnsubscribeFn {
        return this.rpcStream('matrixSubscribeRoomTimelineItems', args)
    }

    async matrixRoomTimelineItemsPaginateBackwards(
        args: bindings.RpcPayload<'matrixRoomTimelineItemsPaginateBackwards'>,
    ) {
        return this.rpcTyped('matrixRoomTimelineItemsPaginateBackwards', args)
    }

    matrixRoomSubscribeTimelineItemsPaginateBackwardsStatus(
        args: StreamRpcArgs<'matrixRoomSubscribeTimelineItemsPaginateBackwardsStatus'>,
    ): UnsubscribeFn {
        return this.rpcStream(
            'matrixRoomSubscribeTimelineItemsPaginateBackwardsStatus',
            args,
        )
    }

    async matrixSendMessage(args: bindings.RpcPayload<'matrixSendMessage'>) {
        return this.rpcTyped('matrixSendMessage', args)
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

    matrixRoomSubscribeInfo(
        args: StreamRpcArgs<'matrixRoomSubscribeInfo'>,
    ): UnsubscribeFn {
        return this.rpcStream('matrixRoomSubscribeInfo', args)
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

    matrixSubscribeSyncIndicator(
        args: StreamRpcArgs<'matrixSubscribeSyncIndicator'>,
    ): UnsubscribeFn {
        return this.rpcStream('matrixSubscribeSyncIndicator', args)
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

    async streamCancel(args: bindings.RpcPayload<'streamCancel'>) {
        return this.rpcTyped('streamCancel', args)
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
    matrixSubscribeMultispendGroup(
        args: StreamRpcArgs<'matrixSubscribeMultispendGroup'>,
    ): UnsubscribeFn {
        return this.rpcStream('matrixSubscribeMultispendGroup', args)
    }

    matrixSubscribeMultispendEventData(
        args: StreamRpcArgs<'matrixSubscribeMultispendEventData'>,
    ): UnsubscribeFn {
        return this.rpcStream('matrixSubscribeMultispendEventData', args)
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
    matrixSubscribeMultispendAccountInfo(
        args: StreamRpcArgs<'matrixSubscribeMultispendAccountInfo'>,
    ): UnsubscribeFn {
        return this.rpcStream('matrixSubscribeMultispendAccountInfo', args)
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
    private streamHandlers = new Map<
        number,
        (update: bindings.RpcStreamUpdate<unknown>) => void
    >()

    emit(eventType: string, data: unknown) {
        if (eventType == 'streamUpdate') {
            const streamData = data as bindings.RpcStreamUpdate<unknown>
            const handler = this.streamHandlers.get(streamData.stream_id)
            if (handler) {
                handler(streamData)
                if (isDev())
                    log.debug(
                        'Received stream update',
                        JSON.stringify(streamData),
                    )
            } else {
                log.warn(
                    'Received stream update without associated stream handler',
                    JSON.stringify(streamData),
                )
            }
        }
        const listeners = this.listeners.get(eventType) || []
        listeners.forEach(listener => listener(data))
    }

    private streamId = 0

    // Helper method that combines RPC call with stream subscription
    private rpcStream<Method extends keyof bindings.RpcMethods>(
        method: Method,
        args: StreamRpcArgs<Method>,
    ): UnsubscribeFn {
        const { callback, ...rpcArgs } = args
        const id = this.streamId++
        const streamId = id as bindings.RpcStreamId<ExtractStreamData<Method>>

        const initPromise = this.rpcTyped(method, {
            ...rpcArgs,
            streamId,
        }).catch(err => {
            log.error('rpcStream init error', { method, id, err })
        })

        // prevent calling the callback if unsubscribe was called
        let cancelled = false

        const unsubscribe = () => {
            cancelled = true
            const deleted = this.streamHandlers.delete(id)
            if (!deleted) {
                log.warn('Tried to delete a handler that does not exist')
            }
            initPromise.then(() => {
                // no need to await, it will happen in background
                this.streamCancel({ streamId: id })
            })
        }

        let nextSequence = 0
        this.streamHandlers.set(
            id,
            (update: bindings.RpcStreamUpdate<unknown>) => {
                // this should never happen due to removing from streamHandlers
                // but this statement doesn't hurt.
                if (cancelled) {
                    log.warn('Stream update received after unsubscribe')
                    return
                }
                if (update.sequence !== nextSequence) {
                    log.warn('Stream sequence mismatch', {
                        id,
                        sequence: update.sequence,
                        nextSequence,
                    })
                }
                nextSequence++
                callback(update.data as ExtractStreamData<Method>)
            },
        )

        return unsubscribe
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
