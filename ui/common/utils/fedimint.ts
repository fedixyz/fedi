import { TFunction } from 'i18next'

import type {
    FedimintBridgeEventMap,
    MSats,
    Sats,
    Transaction,
    bindings,
} from '../types'
import {
    ErrorCode,
    GuardianStatus,
    RpcAmount,
    RpcFeeDetails,
    RpcMediaSource,
    RpcPayAddressResponse,
    RpcRoomId,
    RpcStabilityPoolAccountInfo,
} from '../types/bindings'
import amountUtils from './AmountUtils'
import { makeLog } from './log'

const log = makeLog('common/utils/fedimint')

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

    async stabilityPoolCycleStartPrice(federationId: string) {
        return this.rpcTyped('stabilityPoolCycleStartPrice', { federationId })
    }

    async stabilityPoolNextCycleStartTime(federationId: string) {
        return this.rpcTyped('stabilityPoolNextCycleStartTime', {
            federationId,
        })
    }

    async listTransactions(
        federationId: string,
        startTime?: number,
        limit?: number,
    ) {
        return this.rpcTyped<'listTransactions', Transaction[]>(
            'listTransactions',
            {
                federationId,
                startTime: startTime || null,
                limit: limit || null,
            },
        )
    }

    async guardianStatus(federationId: string) {
        return this.rpcTyped<'guardianStatus', GuardianStatus[]>(
            'guardianStatus',
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

    async joinFederation(inviteCode: string, recoverFromScratch = false) {
        return this.rpcTyped('joinFederation', {
            inviteCode,
            recoverFromScratch,
        })
    }

    async leaveFederation(federationId: string) {
        return this.rpcTyped('leaveFederation', { federationId })
    }

    async listFederations() {
        return this.rpcTyped('listFederations', {})
    }

    async generateInvoice(
        amount: MSats,
        description: string,
        federationId: string,
        expiry: number | null = null,
    ) {
        return this.rpcTyped('generateInvoice', {
            amount,
            description,
            federationId,
            expiry,
        })
    }

    async decodeInvoice(invoice: string, federationId: string | null = null) {
        return this.rpcTyped('decodeInvoice', { invoice, federationId })
    }

    async payInvoice(invoice: string, federationId: string) {
        return this.rpcTyped('payInvoice', {
            invoice,
            federationId,
        })
    }

    async generateAddress(federationId: string) {
        return this.rpcTyped('generateAddress', { federationId })
    }

    async previewPayAddress(address: string, sats: Sats, federationId: string) {
        // FIXME: sats must be bigint to use this.rpcTyped
        return this.rpc<RpcFeeDetails>('previewPayAddress', {
            address,
            sats,
            federationId,
        })
    }

    async payAddress(address: string, sats: Sats, federationId: string) {
        // FIXME: sats must be bigint to use this.rpcTyped
        return this.rpc<RpcPayAddressResponse>('payAddress', {
            address,
            sats,
            federationId,
        })
    }

    async generateEcash(amount: MSats, federationId: string) {
        return this.rpcTyped('generateEcash', { federationId, amount })
    }

    async receiveEcash(ecash: string, federationId: string) {
        return this.rpcTyped('receiveEcash', {
            federationId,
            ecash,
        })
    }

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

    async recoverFromMnemonic(mnemonic: string[]) {
        return this.rpcTyped('recoverFromMnemonic', {
            mnemonic,
        })
    }

    async registerAsNewDevice() {
        return this.rpcTyped('registerAsNewDevice', {})
    }

    async transferExistingDeviceRegistration(index: number) {
        return this.rpcTyped('transferExistingDeviceRegistration', {
            index,
        })
    }

    async deviceIndexAssignmentStatus() {
        return this.rpcTyped('deviceIndexAssignmentStatus', {})
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

    async matrixSendAttachment(args: bindings.RpcPayload<'matrixSendAttachment'>) {
        return this.rpcTyped('matrixSendAttachment', args)
    }

    async matrixEditMessage(roomId: RpcRoomId, eventId: string, newContent: string) {
        return this.rpcTyped('matrixEditMessage', { roomId, eventId, newContent })
    }

    async matrixDeleteMessage(roomId: RpcRoomId, eventId: string, reason: string | null) {
        return this.rpcTyped('matrixDeleteMessage', { roomId, eventId, reason })
    }

    async matrixDownloadFile(path: string, mediaSource: RpcMediaSource) {
        return this.rpcTyped('matrixDownloadFile', { path, mediaSource })
    }

    async matrixStartPoll(roomId: RpcRoomId, question: string, answers: Array<string>) {
        return this.rpcTyped('matrixStartPoll', { roomId, question, answers })
    }

    async matrixEndPoll(roomId: RpcRoomId, pollStartId: string) {
        return this.rpcTyped('matrixEndPoll', { roomId, pollStartId })
    }

    async matrixRespondToPoll(roomId: RpcRoomId, pollStartId: string, selections: Array<string>) {
        return this.rpcTyped('matrixRespondToPoll', { roomId, pollStartId, selections })
    }

    async matrixInit() {
        return this.rpcTyped('matrixInit', {})
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

    async matrixRoomList() {
        return this.rpcTyped('matrixRoomList', {})
    }

    async matrixRoomListUpdateRanges(
        args: bindings.RpcPayload<'matrixRoomListUpdateRanges'>,
    ) {
        return this.rpcTyped('matrixRoomListUpdateRanges', args)
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

    /** @deprecated */
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

    async matrixObserveSyncIndicator() {
        return this.rpcTyped('matrixObserveSyncIndicator', {})
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
        args: bindings.RpcPayload<'matrixObserverCancel'>,
    ) {
        return this.rpcTyped('matrixObserverCancel', args)
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

    /*** BRIDGE EVENTS ***/

    private listeners = new Map<string, Array<(data: unknown) => void>>()

    emit(eventType: string, data: unknown) {
        const listeners = this.listeners.get(eventType) || []
        listeners.forEach(listener => listener(data))
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

export class BridgeError extends Error {
    public detail: string
    public error: string
    public code: ErrorCode | null

    constructor(json: {
        detail: string
        error: string
        code: ErrorCode | null
    }) {
        super(json.error)
        this.error = json.error
        this.code = json.code
        this.detail = json.detail
    }

    public format(t: TFunction) {
        if (
            this.code &&
            typeof this.code === 'object' &&
            'insufficientBalance' in this.code &&
            typeof this.code.insufficientBalance === 'number'
        ) {
            return t('errors.insufficient-balance-send', {
                sats: amountUtils.msatToSat(this.code.insufficientBalance),
            })
        }

        return this.error
    }
}
