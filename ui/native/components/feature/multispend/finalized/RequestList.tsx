import { Text, Theme, useTheme } from '@rneui/themed'
import { ResourceKey } from 'i18next'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ListRenderItem, StyleSheet, FlatList } from 'react-native'

import {
    useMultispendTransactions,
    useMultispendVoting,
    useMultispendWithdrawalRequests,
} from '@fedi/common/hooks/multispend'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../../../../bridge'
import {
    MultispendFilterOption,
    MultispendWithdrawalEvent,
} from '../../../../types'
import CustomOverlay from '../../../ui/CustomOverlay'
import Flex from '../../../ui/Flex'
import OverlaySelect from '../../../ui/OverlaySelect'
import SvgImage from '../../../ui/SvgImage'
import WithdrawalOverlayContents from './WithdrawalOverlayContents'
import WithdrawalRequest from './WithdrawalRequest'

const log = makeLog('RequestList')

const RequestList: React.FC<{ roomId: string }> = ({ roomId }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const [isLoading, setIsLoading] = useState(false)
    const {
        isVoting,
        selectedWithdrawalId,
        setSelectedWithdrawalId,
        withdrawalRequests,
        filteredWithdrawalRequests,
        haveIVotedForWithdrawal,
        handleRejectRequest,
        handleApproveRequest,
        filter,
        filterOptions,
        selectedFilterOption,
        setFilter,
    } = useMultispendWithdrawalRequests({ t, fedimint, roomId })
    const { fetchTransactions } = useMultispendTransactions(t, roomId)
    const { canVote } = useMultispendVoting({ t, fedimint, roomId })

    useEffect(() => {
        setIsLoading(true)
        fetchTransactions()
            .catch(err => {
                log.error('Error refreshing transactions', err)
            })
            .finally(() => setIsLoading(false))
    }, [fetchTransactions, t])

    const selectedWithdrawal = withdrawalRequests.find(
        withdrawal => withdrawal.id === selectedWithdrawalId,
    )

    const haveIVoted = selectedWithdrawal
        ? haveIVotedForWithdrawal(selectedWithdrawal)
        : false

    const renderWithdrawalRequest: ListRenderItem<MultispendWithdrawalEvent> =
        useCallback(
            ({ item }) => (
                <WithdrawalRequest
                    key={`multispend-withdrawal-request-${item.id}`}
                    roomId={roomId}
                    event={item}
                    onSelect={() => setSelectedWithdrawalId(item.id)}
                />
            ),
            [roomId, setSelectedWithdrawalId],
        )

    const style = styles(theme)

    const filterMessageMap: Record<MultispendFilterOption, ResourceKey> = {
        pending: 'feature.multispend.no-pending-withdrawal-requests',
        approved: 'feature.multispend.no-approved-withdrawal-requests',
        rejected: 'feature.multispend.no-rejected-withdrawal-requests',
        failed: 'feature.multispend.no-failed-withdrawal-requests',
        all: 'feature.multispend.no-withdrawal-requests',
    }

    return (
        <Flex grow>
            <Flex
                row
                align="center"
                justify="between"
                gap="md"
                style={style.header}>
                <Text medium>
                    {t('feature.multispend.withdrawal-requests')}
                </Text>
                <OverlaySelect
                    value={filter}
                    onValueChange={value =>
                        setFilter(value as MultispendFilterOption)
                    }
                    options={filterOptions}
                />
            </Flex>
            <FlatList
                style={style.requestList}
                contentContainerStyle={style.requestListContainer}
                data={filteredWithdrawalRequests}
                renderItem={renderWithdrawalRequest}
                onRefresh={fetchTransactions}
                refreshing={isLoading}
                keyExtractor={item =>
                    `multispend-withdrawal-request-${item.id}`
                }
                ListEmptyComponent={() => (
                    <Flex center gap="md" grow style={style.emptyState}>
                        <SvgImage
                            color={theme.colors.grey}
                            size={52}
                            name="MultispendGroup"
                        />
                        <Text medium style={style.emptyTitle}>
                            {t(
                                filterMessageMap[
                                    selectedFilterOption?.value ?? 'all'
                                ],
                            )}
                        </Text>
                        <Text small style={style.emptyDescription}>
                            {t('feature.multispend.no-requests-notice')}
                        </Text>
                    </Flex>
                )}
            />
            <CustomOverlay
                show={!!selectedWithdrawalId}
                onBackdropPress={() => setSelectedWithdrawalId(null)}
                contents={{
                    title: t('feature.multispend.review-withdrawal-request'),
                    body: selectedWithdrawal && (
                        <WithdrawalOverlayContents
                            selectedWithdrawal={selectedWithdrawal}
                            roomId={roomId}
                        />
                    ),
                    buttons:
                        haveIVoted || !canVote
                            ? undefined
                            : [
                                  {
                                      text: t('words.reject'),
                                      onPress: handleRejectRequest,
                                      disabled: isVoting,
                                  },
                                  {
                                      text: t('words.approve'),
                                      onPress: handleApproveRequest,
                                      primary: true,
                                      disabled: isVoting,
                                  },
                              ],
                }}
            />
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        header: {
            padding: theme.spacing.md,
        },
        emptyState: {
            paddingHorizontal: theme.spacing.lg,
        },
        emptyTitle: {
            textAlign: 'center',
            fontSize: 20,
            color: theme.colors.grey,
        },
        emptyDescription: {
            textAlign: 'center',
            color: theme.colors.grey,
        },
        requestList: {
            flex: 1,
        },
        requestListContainer: {
            flexDirection: 'column',
        },
    })

export default RequestList
