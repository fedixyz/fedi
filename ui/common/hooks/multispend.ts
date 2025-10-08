import type { TFunction } from 'i18next'
import { useState, useMemo, useEffect, useCallback } from 'react'

import {
    matrixApproveMultispendInvitation,
    matrixRejectMultispendInvitation,
    selectMatrixRoomMultispendStatus,
    selectMatrixAuth,
    selectMyMultispendRole,
    selectLoadedFederations,
    selectRoomMultispendFinancialTransactions,
    fetchMultispendTransactions,
    selectCurrency,
    selectMatrixRoomMembers,
    selectMultispendInvitationEvent,
    selectMatrixRoomMember,
    selectMatrixRoomMultispendEvent,
    selectMultispendBalanceCents,
} from '../redux'
import {
    MultispendFilterOption,
    MultispendWithdrawalEvent,
    UsdCents,
    MultispendRole,
    MultispendListedInvitationEvent,
    MatrixMultispendEvent,
} from '../types'
import { RpcMultispendGroupStatus, RpcRoomId } from '../types/bindings'
import { FedimintBridge } from '../utils/fedimint'
import {
    getMultispendInvite,
    isMultispendWithdrawalEvent,
    isWithdrawalRequestApproved,
    isWithdrawalRequestRejected,
    makeMultispendWalletHeader,
} from '../utils/matrix'
import { useBtcFiatPrice } from './amount'
import { useFedimint } from './fedimint'
import { useObserveMultispendEvent } from './matrix'
import { useCommonDispatch, useCommonSelector } from './redux'
import { useToast } from './toast'

export function useMultispendVoting({
    t,
    fedimint,
    roomId,
    onMultispendAborted = undefined,
    onJoinFederation = undefined,
}: {
    t: TFunction
    fedimint: FedimintBridge
    roomId: RpcRoomId
    onMultispendAborted?: () => void
    onJoinFederation?: (invite: string) => void
}) {
    const toast = useToast()
    const dispatch = useCommonDispatch()
    const [isConfirmingAbort, setIsConfirmingAbort] = useState(false)
    const [needsToJoin, setNeedsToJoin] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const walletFederations = useCommonSelector(selectLoadedFederations)
    const myId = useCommonSelector(selectMatrixAuth)?.userId
    const multispendStatus = useCommonSelector(s =>
        selectMatrixRoomMultispendStatus(s, roomId),
    )
    const multispendInvite = multispendStatus
        ? getMultispendInvite(multispendStatus)
        : null
    const myMultispendRole = useCommonSelector(s =>
        selectMyMultispendRole(s, roomId),
    )
    const isProposer = myMultispendRole === 'proposer'
    const hasRejected = Boolean(
        multispendStatus?.status === 'activeInvitation' &&
            myId &&
            multispendStatus.state.rejections.includes(myId),
    )
    const hasApproved = Boolean(
        multispendStatus?.status === 'activeInvitation' &&
            myId &&
            Object.keys(multispendStatus.state.pubkeys).includes(myId),
    )

    const canVote = !hasApproved && !hasRejected && myMultispendRole === 'voter'

    const handleAbortMultispend = async () => {
        if (!isProposer) return

        setIsLoading(true)
        try {
            await fedimint.matrixCancelMultispendGroupInvitation({
                roomId,
            })
        } catch (e) {
            toast.error(t, e)
        } finally {
            setIsLoading(false)
        }
    }

    const handleRejectMultispend = async () => {
        if (isProposer) return

        setIsLoading(true)
        try {
            await dispatch(
                matrixRejectMultispendInvitation({ roomId, fedimint }),
            ).unwrap()
            setIsConfirmingAbort(false)
        } catch (e) {
            toast.error(t, e)
        } finally {
            setIsLoading(false)
        }
    }

    const handleAcceptMultispend = async () => {
        if (!multispendStatus) return
        if (multispendStatus.status !== 'activeInvitation') return
        setIsLoading(true)
        try {
            if (
                !walletFederations.some(
                    f => f.id === multispendStatus.state.federationId,
                )
            ) {
                setNeedsToJoin(true)
            } else {
                await dispatch(
                    matrixApproveMultispendInvitation({ fedimint, roomId }),
                ).unwrap()
            }
        } catch (e) {
            toast.error(t, e)
        } finally {
            setIsLoading(false)
        }
    }

    const abortConfirmationContents = {
        title: t('feature.multispend.abort-multispend-setup'),
        description: t('feature.multispend.abort-group-message'),
        buttons: [
            {
                text: t('words.cancel'),
                onPress: () => setIsConfirmingAbort(false),
            },
            {
                text: t('feature.multispend.yes-abort'),
                primary: true,
                disabled: isLoading,
                onPress: handleAbortMultispend,
            },
        ],
    }

    const rejectConfirmationContents = {
        title: t('feature.multispend.abort-multispend-setup'),
        description: t('feature.multispend.reject-invite-message'),
        buttons: [
            {
                text: t('words.cancel'),
                onPress: () => setIsConfirmingAbort(false),
            },
            {
                text: t('feature.multispend.yes-reject'),
                primary: true,
                disabled: isLoading,
                onPress: handleRejectMultispend,
            },
        ],
    }

    const joinBeforeAcceptContents = multispendInvite
        ? {
              title: t('feature.multispend.join-federation', {
                  federation: multispendInvite.federationName,
              }),
              description: t('feature.multispend.join-federation-notice', {
                  federation: multispendInvite.federationName,
              }),
              buttons: [
                  {
                      text: t('words.cancel'),
                      onPress: () => setNeedsToJoin(false),
                  },
                  {
                      text: t('words.join'),
                      onPress: () =>
                          onJoinFederation &&
                          onJoinFederation(
                              multispendInvite.federationInviteCode,
                          ),
                      primary: true,
                  },
              ],
          }
        : null

    // If the multispend group is aborted for any reason, fire a callback that should handle navigating back to the chat
    useEffect(() => {
        if (!multispendStatus && onMultispendAborted) {
            onMultispendAborted()
        }
    }, [multispendStatus, onMultispendAborted])

    return {
        isActive: multispendStatus?.status === 'activeInvitation',
        isFinalized: multispendStatus?.status === 'finalized',
        isProposer,
        isLoading,
        isConfirmingAbort,
        setIsConfirmingAbort,
        canVote,
        needsToJoin,
        handleAcceptMultispend,
        handleAbortMultispend,
        handleRejectMultispend,
        abortConfirmationContents,
        rejectConfirmationContents,
        joinBeforeAcceptContents,
    }
}

export function useMultispendDisplayUtils(t: TFunction, roomId: RpcRoomId) {
    const selectedCurrency = useCommonSelector(selectCurrency)
    const multispendStatus = useCommonSelector(s =>
        selectMatrixRoomMultispendStatus(s, roomId),
    )
    const myMultispendRole = useCommonSelector(s =>
        selectMyMultispendRole(s, roomId),
    )
    const { convertCentsToFormattedFiat } = useBtcFiatPrice()
    const multispendBalanceCents = useCommonSelector(s =>
        selectMultispendBalanceCents(s, roomId),
    )
    const formattedMultispendBalance = convertCentsToFormattedFiat(
        multispendBalanceCents,
        'none',
    )

    const isActiveInvitation = multispendStatus?.status === 'activeInvitation'
    const isFinalized = multispendStatus?.status === 'finalized'

    const shouldShowHeader = isActiveInvitation || isFinalized

    const shouldShowVoters = isActiveInvitation

    const shouldBlockLeaveRoom =
        multispendStatus &&
        (myMultispendRole === 'voter' || myMultispendRole === 'proposer')

    const walletHeader = makeMultispendWalletHeader(t, multispendStatus)

    return {
        shouldShowHeader,
        shouldShowVoters,
        shouldBlockLeaveRoom,
        walletHeader,
        formattedMultispendBalance,
        selectedCurrency,
    }
}

export function useMultispendTransactions(t: TFunction, roomId: RpcRoomId) {
    const toast = useToast()
    const fedimint = useFedimint()
    const dispatch = useCommonDispatch()
    const transactions = useCommonSelector(s =>
        selectRoomMultispendFinancialTransactions(s, roomId),
    )
    const fetchTransactions = useCallback(
        async (
            args?: Pick<
                Parameters<typeof fetchMultispendTransactions>[0],
                'limit' | 'more' | 'refresh'
            >,
        ) => {
            try {
                await dispatch(
                    fetchMultispendTransactions({ fedimint, roomId, ...args }),
                ).unwrap()
            } catch (e) {
                toast.error(t, e)
            }
        },
        [dispatch, roomId, t, toast, fedimint],
    )

    return {
        transactions,
        fetchTransactions,
    }
}

export function useMultispendWithdrawUtils(roomId: RpcRoomId) {
    const multispendStatus = useCommonSelector(s =>
        selectMatrixRoomMultispendStatus(s, roomId),
    )

    const getWithdrawalStatus = useCallback(
        (event: MultispendWithdrawalEvent) => {
            if (multispendStatus?.status !== 'finalized') return 'pending'

            const txStatus = event.event.withdrawalRequest.txSubmissionStatus

            if (txStatus === 'unknown') return 'pending'
            if ('accepted' in txStatus) return 'completed'
            if ('rejected' in txStatus) return 'failed'

            if (isWithdrawalRequestApproved(event, multispendStatus))
                return 'approved'
            if (isWithdrawalRequestRejected(event, multispendStatus))
                return 'rejected'

            return 'pending'
        },
        [multispendStatus],
    )

    return {
        getWithdrawalStatus,
    }
}

export function useMultispendWithdrawalRequests({
    t,
    fedimint,
    roomId,
}: {
    t: TFunction
    fedimint: FedimintBridge
    roomId: RpcRoomId
}) {
    const toast = useToast()
    const selectedFiatCurrency = useCommonSelector(selectCurrency)
    const { convertCentsToFormattedFiat } =
        useBtcFiatPrice(selectedFiatCurrency)
    const [selectedWithdrawalId, setSelectedWithdrawalId] = useState<
        string | null
    >(null)
    const [isVoting, setIsVoting] = useState(false)
    const [filter, setFilter] = useState<MultispendFilterOption>('all')
    const multispendStatus = useCommonSelector(s =>
        selectMatrixRoomMultispendStatus(s, roomId),
    )
    const { transactions } = useMultispendTransactions(t, roomId)
    const { getWithdrawalStatus } = useMultispendWithdrawUtils(roomId)
    const matrixAuth = useCommonSelector(selectMatrixAuth)
    const roomMembers = useCommonSelector(s =>
        selectMatrixRoomMembers(s, roomId),
    )
    const myMultispendRole = useCommonSelector(s =>
        selectMyMultispendRole(s, roomId),
    )
    const canVoteOnWithdrawals =
        myMultispendRole === 'voter' || myMultispendRole === 'proposer'

    const withdrawalRequests = transactions.filter(
        (txn): txn is MultispendWithdrawalEvent => txn.state === 'withdrawal',
    )

    const getFormattedWithdrawalStatus = useCallback(
        (event: MultispendWithdrawalEvent) => {
            const status = getWithdrawalStatus(event)

            switch (status) {
                case 'approved':
                    return t('words.approved')
                case 'rejected':
                    return t('words.rejected')
                case 'pending':
                    return t('words.pending')
                case 'completed':
                    return t('words.complete')
                case 'failed':
                    return t('words.failed')
            }
        },
        [t, getWithdrawalStatus],
    )

    const hasUserVotedForWithdrawal = useCallback(
        (event: MultispendWithdrawalEvent, userId: string) => {
            const rejections = event.event.withdrawalRequest.rejections
            const signatures = event.event.withdrawalRequest.signatures

            return Boolean(rejections.includes(userId) || signatures[userId])
        },
        [],
    )

    const haveIVotedForWithdrawal = useCallback(
        (event: MultispendWithdrawalEvent) => {
            return hasUserVotedForWithdrawal(event, matrixAuth?.userId ?? '')
        },
        [hasUserVotedForWithdrawal, matrixAuth?.userId],
    )

    const filteredWithdrawalRequests = useMemo(() => {
        if (filter === 'all' || multispendStatus?.status !== 'finalized')
            return withdrawalRequests

        const filtered = withdrawalRequests.filter(event => {
            const eventStatus = getWithdrawalStatus(event)

            if (filter === 'approved')
                return eventStatus === 'approved' || eventStatus === 'completed'

            return eventStatus === filter
        })

        if (filter === 'pending') {
            filtered
                // Sort by oldest
                .sort((a, b) => a.time - b.time)
                // Sort by not voted for
                .sort((a, b) => {
                    if (!matrixAuth) return 0

                    if (hasUserVotedForWithdrawal(a, matrixAuth.userId))
                        return 1
                    if (hasUserVotedForWithdrawal(b, matrixAuth.userId))
                        return -1
                    return 0
                })
        }

        return filtered
    }, [
        filter,
        multispendStatus?.status,
        withdrawalRequests,
        getWithdrawalStatus,
        matrixAuth,
        hasUserVotedForWithdrawal,
    ])

    const getWithdrawalRequest = useCallback(
        (event: MultispendWithdrawalEvent) => {
            const { withdrawalRequest } = event.event

            const sender = roomMembers.find(
                m => m.id === withdrawalRequest.sender,
            )
            const approvals = Object.keys(withdrawalRequest.signatures)
            const rejections = withdrawalRequest.rejections

            return {
                sender,
                request: withdrawalRequest,
                approvals,
                rejections,
                approvalCount: approvals.length,
                rejectionCount: rejections.length,
                formattedFiatAmount: convertCentsToFormattedFiat(
                    withdrawalRequest.request.transfer_amount as UsdCents,
                    'none',
                ),
                formattedFiatAmountWithCurrency: convertCentsToFormattedFiat(
                    withdrawalRequest.request.transfer_amount as UsdCents,
                    'end',
                ),
                selectedFiatCurrency,
                status: getWithdrawalStatus(event) as ReturnType<
                    typeof getWithdrawalStatus
                >,
            }
        },
        [
            roomMembers,
            convertCentsToFormattedFiat,
            selectedFiatCurrency,
            getWithdrawalStatus,
        ],
    )

    const handleRejectRequest = useCallback(async () => {
        if (!selectedWithdrawalId) return

        setIsVoting(true)
        try {
            await fedimint.matrixSendMultispendWithdrawalReject({
                roomId,
                withdrawRequestId: selectedWithdrawalId,
            })

            setSelectedWithdrawalId(null)
        } catch (e) {
            toast.error(t, e)
        } finally {
            setIsVoting(false)
        }
    }, [selectedWithdrawalId, t, toast, roomId, fedimint])

    const handleApproveRequest = useCallback(async () => {
        if (!selectedWithdrawalId) return

        setIsVoting(true)
        try {
            await fedimint.matrixSendMultispendWithdrawalApprove({
                roomId,
                withdrawRequestId: selectedWithdrawalId,
            })

            setSelectedWithdrawalId(null)
        } catch (e) {
            toast.error(t, e)
        } finally {
            setIsVoting(false)
        }
    }, [selectedWithdrawalId, roomId, t, toast, fedimint])

    const filterOptions: Array<{
        value: MultispendFilterOption
        label: string
    }> = [
        { value: 'all', label: t('words.all') },
        { value: 'pending', label: t('words.pending') },
        { value: 'approved', label: t('words.approved') },
        { value: 'rejected', label: t('words.rejected') },
    ]
    const selectedFilterOption = filterOptions.find(
        option => option.value === filter,
    )

    return {
        isVoting,
        filter,
        setFilter,
        filterOptions,
        selectedFilterOption,
        selectedWithdrawalId,
        setSelectedWithdrawalId,
        withdrawalRequests,
        getWithdrawalStatus,
        getFormattedWithdrawalStatus,
        hasUserVotedForWithdrawal,
        haveIVotedForWithdrawal,
        filteredWithdrawalRequests,
        getWithdrawalRequest,
        handleRejectRequest,
        handleApproveRequest,
        canVoteOnWithdrawals,
    }
}

const extractInvitationData = (
    event: MatrixMultispendEvent<'groupInvitation'>,
    invitation: MultispendListedInvitationEvent | undefined,
    roomStatus: RpcMultispendGroupStatus | undefined,
    myId: string | undefined,
) => {
    const finalizedInvitationId =
        roomStatus?.status === 'finalized'
            ? roomStatus.invite_event_id
            : undefined

    const activeInvitationId =
        roomStatus?.status === 'activeInvitation' &&
        // Assume failed if there are rejections
        roomStatus.state.rejections.length === 0
            ? roomStatus.active_invite_id
            : undefined

    // If we found the data from the observed event, use that
    if (invitation) {
        const invite = invitation.event.groupInvitation.invitation
        return {
            proposer: invitation.event.groupInvitation.proposer,
            status:
                activeInvitationId === invitation.id
                    ? ('activeInvitation' as const)
                    : finalizedInvitationId === invitation.id
                      ? ('finalized' as const)
                      : ('inactive' as const),
            role:
                event.sender === myId
                    ? ('proposer' as const)
                    : myId !== undefined && invite.signers.includes(myId)
                      ? ('voter' as const)
                      : ('member' as const),
            voters: invite.signers.length,
            hasVoted:
                myId !== undefined &&
                invitation.event.groupInvitation.pubkeys[myId] !== undefined,
            threshold: invite.threshold,
            hasInvite: true,
        }
    }
    // Fallback to using data from the chat event itself
    else {
        const invite = event.content.invitation
        const proposer = event.sender ?? ''
        const role =
            proposer === myId
                ? ('proposer' as const)
                : myId !== undefined && invite.signers.includes(myId)
                  ? ('voter' as const)
                  : ('member' as const)
        return {
            status:
                activeInvitationId === event.id
                    ? ('activeInvitation' as const)
                    : finalizedInvitationId === event.id
                      ? ('finalized' as const)
                      : ('inactive' as const),
            role,
            proposer,
            // If we don't have the loaded invitation data, we can
            // only be certain the user voted if they are the proposer
            hasVoted: role === 'proposer',
            voters: invite.signers.length,
            threshold: invite.threshold,
            hasInvite: false,
        }
    }
}

export function useMultispendInvitationEventContent(
    event: MatrixMultispendEvent<'groupInvitation'>,
): {
    status: RpcMultispendGroupStatus['status']
    statusDescription?: string
    voters: number
    threshold: number
    proposer: string
    hasVoted: boolean
    role: MultispendRole
    hasInvite: boolean
    hasStatus: boolean
} {
    useObserveMultispendEvent(event.roomId, event?.id ?? '')

    const invitation = useCommonSelector(s =>
        selectMultispendInvitationEvent(s, event.roomId, event?.id ?? ''),
    )

    const myId = useCommonSelector(selectMatrixAuth)?.userId

    // Finalized or active invitation
    const roomStatus = useCommonSelector(s =>
        selectMatrixRoomMultispendStatus(s, event.roomId),
    )

    const data = useMemo(
        () => extractInvitationData(event, invitation, roomStatus, myId),
        [event, invitation, roomStatus, myId],
    )

    return {
        ...data,
        hasStatus: !!roomStatus,
    }
}

// Helpful for developing when adding new event types.
// This is a nice starting point
// export function useMultispendChatEventContent({
//     t,
//     event,
// }: {
//     t: TFunction
//     event: MultispendEvent
//     createBullets: (heading: string, lines: ReactNode[]) => ReactNode
// }): {
//     heading: string
//     body1?: ReactNode
//     body2?: string
//     status?: string
//     threshold?: number
// } {
//     return {
//         heading: t('feature.multispend.message-header'),
//         body1: `${event.content.body}: ${event.content.kind}`,
//         body2: 'TODO: implement me',
//     }
// }

export function useMultispendDepositEventContent({
    t,
    event,
}: {
    t: TFunction
    event: MatrixMultispendEvent<'depositNotification'>
}): {
    heading: string
    senderName: string | undefined
    formattedFiatAmount: string
} {
    const selectedFiatCurrency = useCommonSelector(selectCurrency)
    const { convertCentsToFormattedFiat } =
        useBtcFiatPrice(selectedFiatCurrency)
    const { sender, content } = event
    const senderMember = useCommonSelector(s =>
        selectMatrixRoomMember(s, event.roomId, sender ?? ''),
    )
    const senderName = senderMember
        ? senderMember.membership === 'leave'
            ? t('feature.chat.former-member')
            : senderMember.displayName
        : t('words.member')

    const formattedFiatAmount = convertCentsToFormattedFiat(
        content.fiatAmount as UsdCents,
        'end',
    )

    return {
        heading: t('feature.multispend.chat-events.message-header'),
        senderName,
        formattedFiatAmount,
    }
}

export function useMultispendWithdrawalEventContent({
    t,
    event,
}: {
    t: TFunction
    event: MatrixMultispendEvent<'withdrawalRequest'>
}): {
    heading: string
    senderName: string | undefined
    formattedFiatAmount: string
    text?: string
    subText?: string
} {
    const { sender, content, roomId } = event
    const { getWithdrawalStatus } = useMultispendWithdrawUtils(roomId)
    const selectedFiatCurrency = useCommonSelector(selectCurrency)
    const { convertCentsToFormattedFiat } =
        useBtcFiatPrice(selectedFiatCurrency)
    const senderMember = useCommonSelector(s =>
        selectMatrixRoomMember(s, roomId, sender ?? ''),
    )
    const senderName = senderMember
        ? senderMember.membership === 'leave'
            ? t('feature.chat.former-member')
            : senderMember.displayName
        : t('words.member')
    const formattedFiatAmount = convertCentsToFormattedFiat(
        content.request.transfer_amount as UsdCents,
        'end',
    )
    let text = t('feature.multispend.chat-events.withdrawal-requested')
    let subText = ''
    useObserveMultispendEvent(event.roomId, event?.id ?? '')

    const withdrawalEvent = useCommonSelector(s =>
        selectMatrixRoomMultispendEvent(s, event.roomId, event?.id ?? ''),
    )
    if (withdrawalEvent && isMultispendWithdrawalEvent(withdrawalEvent)) {
        const status = getWithdrawalStatus(withdrawalEvent)
        switch (status) {
            case 'rejected':
                text = t(`feature.multispend.chat-events.withdrawal-requested`)
                subText = t(
                    'feature.multispend.chat-events.withdrawal-rejected',
                )
                break
            case 'approved':
            case 'completed':
                text = t(
                    'feature.multispend.chat-events.withdrawal-approved-body',
                )
                subText = t(
                    'feature.multispend.chat-events.withdrawal-approved',
                )
                break
            case 'failed':
                text = t('feature.multispend.chat-events.withdrawal-failed')
                break
            case 'pending':
            default:
                text = t(`feature.multispend.chat-events.withdrawal-requested`)
        }
    }

    return {
        heading: t('feature.multispend.chat-events.message-header'),
        senderName,
        formattedFiatAmount,
        text,
        subText,
    }
}
