import { Text, Theme, useTheme } from '@rneui/themed'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ListRenderItem, StyleSheet, View, FlatList } from 'react-native'

import {
    useMultispendTransactions,
    useMultispendWithdrawalRequests,
} from '@fedi/common/hooks/multispend'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../../../../bridge'
import {
    MultispendFilterOption,
    MultispendWithdrawalEvent,
} from '../../../../types'
import CustomOverlay from '../../../ui/CustomOverlay'
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

    return (
        <View style={style.container}>
            <View style={style.header}>
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
            </View>
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
                    <View style={style.emptyState}>
                        <SvgImage
                            color={theme.colors.grey}
                            size={52}
                            name="MultispendGroup"
                        />
                        <Text medium style={style.emptyTitle}>
                            {t('feature.multispend.no-verb-requests', {
                                verb: selectedFilterOption?.label,
                            })}
                        </Text>
                        <Text small style={style.emptyDescription}>
                            {t('feature.multispend.no-requests-notice')}
                        </Text>
                    </View>
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
                    buttons: haveIVoted
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
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            flexDirection: 'column',
        },
        loadingContainer: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
        },
        header: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: theme.spacing.md,
        },
        emptyState: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.md,
            paddingHorizontal: theme.spacing.lg,
            flex: 1,
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
            flex: 1,
        },
    })

export default RequestList
