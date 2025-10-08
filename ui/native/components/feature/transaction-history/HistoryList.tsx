import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ActivityIndicator,
    FlatList,
    ListRenderItem,
    StyleSheet,
} from 'react-native'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import { FeeItem } from '@fedi/common/hooks/transactions'
import { Federation } from '@fedi/common/types'

import Flex from '../../ui/Flex'
import { SafeAreaContainer } from '../../ui/SafeArea'
import { HistoryDetailProps } from './HistoryDetail'
import HistoryDetailOverlay from './HistoryDetailOverlay'
import { HistoryRow, HistoryRowProps } from './HistoryRow'
import { HistoryRowError } from './HistoryRowError'

interface Props<T extends { id: string }> {
    rows: T[]
    loading?: boolean
    makeRowProps: (item: T) => Omit<HistoryRowProps, 'icon' | 'onSelect'>
    makeDetailProps: (item: T) => Omit<HistoryDetailProps, 'icon' | 'onClose'>
    makeFeeItems: (item: T) => FeeItem[]
    makeShowAskFedi: (item: T) => boolean
    makeIcon: (item: T) => React.ReactNode
    onEndReached?: () => void
    onRefresh?: () => void
    federationId?: Federation['id']
}

export function HistoryList<T extends { id: string }>({
    rows,
    loading,
    makeRowProps,
    makeDetailProps,
    makeFeeItems,
    makeShowAskFedi,
    makeIcon,
    onEndReached,
    onRefresh,
    federationId = '',
}: Props<T>): React.ReactElement {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
    const selectedItem = useMemo(
        () =>
            selectedItemId
                ? rows.find(item => item.id === selectedItemId)
                : undefined,
        [selectedItemId, rows],
    )
    const feeItems = useMemo(
        () => (selectedItem ? makeFeeItems(selectedItem) : []),
        [selectedItem, makeFeeItems],
    )

    const renderRow = useCallback<ListRenderItem<T>>(
        ({ item }) => {
            const rowProps = makeRowProps(item)
            return (
                <ErrorBoundary fallback={() => <HistoryRowError />}>
                    <HistoryRow
                        {...rowProps}
                        icon={makeIcon(item)}
                        onSelect={() => setSelectedItemId(item.id)}
                    />
                </ErrorBoundary>
            )
        },
        [makeRowProps, makeIcon],
    )

    const style = styles(theme)

    if (loading) {
        return (
            <Flex grow center fullWidth>
                <ActivityIndicator />
            </Flex>
        )
    }

    if (!rows.length) {
        return (
            <Flex grow center fullWidth>
                <Text style={style.emptyText}>
                    {t('phrases.no-transactions')}
                </Text>
            </Flex>
        )
    }

    return (
        <SafeAreaContainer style={style.container} edges="bottom">
            <FlatList
                data={rows}
                renderItem={renderRow}
                contentContainerStyle={style.content}
                keyExtractor={item => item.id}
                // optimization that allows skipping the measurement of dynamic content
                // for fixed-size list items
                getItemLayout={(_, index) => ({
                    length: 62, // 38 height + 24 margin
                    offset: 62 * index,
                    index,
                })}
                initialNumToRender={20}
                onRefresh={onRefresh ? onRefresh : undefined}
                refreshing={loading || false}
                onEndReached={() => onEndReached && onEndReached()}
                onEndReachedThreshold={0.9}
            />
            <HistoryDetailOverlay
                show={!!selectedItemId}
                itemDetails={
                    selectedItem && {
                        ...makeDetailProps(selectedItem),
                        icon: makeIcon(selectedItem),
                        onClose: () => setSelectedItemId(null),
                    }
                }
                feeItems={feeItems}
                showAskFedi={
                    selectedItem ? makeShowAskFedi(selectedItem) : false
                }
                federationId={federationId}
            />
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            width: '100%',
            paddingBottom: 0,
        },
        content: {
            paddingTop: theme.spacing.xl,
        },
        emptyText: {
            textAlign: 'center',
        },
    })
