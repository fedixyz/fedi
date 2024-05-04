import { Overlay, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ActivityIndicator,
    FlatList,
    ListRenderItem,
    StyleSheet,
    View,
} from 'react-native'
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'

import { HistoryDetail, HistoryDetailProps } from './HistoryDetail'
import { HistoryRow, HistoryRowProps } from './HistoryRow'
import { HistoryRowError } from './HistoryRowError'
import SvgImage, { SvgImageSize } from './SvgImage'

interface Props<T extends { id: string }> {
    rows: T[]
    loading?: boolean
    makeRowProps: (item: T) => Omit<HistoryRowProps, 'icon' | 'onSelect'>
    makeDetailProps: (item: T) => Omit<HistoryDetailProps, 'icon' | 'onClose'>
    makeIcon: (item: T) => React.ReactNode
    onEndReached?: () => void
}

export function HistoryList<T extends { id: string }>({
    rows,
    loading,
    makeRowProps,
    makeDetailProps,
    makeIcon,
    onEndReached,
}: Props<T>): React.ReactElement {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const insets = useSafeAreaInsets()
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
    const selectedItem = selectedItemId
        ? rows.find(item => item.id === selectedItemId)
        : undefined

    const renderRow: ListRenderItem<T> = ({ item }) => {
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
    }

    const style = styles(theme, insets)

    if (loading) {
        return (
            <View style={style.emptyContainer}>
                <ActivityIndicator />
            </View>
        )
    }

    if (!rows.length) {
        return (
            <View style={style.emptyContainer}>
                <Text style={style.emptyText}>
                    {t('phrases.no-transactions')}
                </Text>
            </View>
        )
    }

    return (
        <View style={style.container}>
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
                onEndReached={() => onEndReached && onEndReached()}
                onEndReachedThreshold={0.9}
            />
            <Overlay
                isVisible={!!selectedItem}
                overlayStyle={style.overlayContainer}
                onBackdropPress={() => setSelectedItemId(null)}>
                {selectedItem && (
                    <ErrorBoundary
                        fallback={
                            <View style={style.overlayErrorContainer}>
                                <SvgImage
                                    name="Error"
                                    color={theme.colors.red}
                                    size={SvgImageSize.lg}
                                />
                                <Text style={style.overlayErrorText}>
                                    {t('errors.history-render-error')}
                                </Text>
                            </View>
                        }>
                        <HistoryDetail
                            {...makeDetailProps(selectedItem)}
                            icon={makeIcon(selectedItem)}
                            onClose={() => setSelectedItemId(null)}
                        />
                    </ErrorBoundary>
                )}
            </Overlay>
        </View>
    )
}

const styles = (theme: Theme, insets: EdgeInsets) =>
    StyleSheet.create({
        container: {
            flex: 1,
            width: '100%',
        },
        content: {
            paddingTop: theme.spacing.xl,
            paddingLeft: insets.left,
            paddingRight: insets.right,
            paddingBottom: Math.min(insets.bottom, theme.spacing.lg),
        },
        overlayContainer: {
            width: '90%',
            maxWidth: 340,
            padding: theme.spacing.xl,
            borderRadius: theme.borders.defaultRadius,
            alignItems: 'center',
        },
        overlayErrorContainer: {
            paddingVertical: theme.spacing.xl,
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
        },
        overlayErrorText: {
            marginTop: theme.spacing.lg,
            textAlign: 'center',
        },
        emptyContainer: {
            flex: 1,
            width: '100%',
            justifyContent: 'center',
            alignItems: 'center',
        },
        emptyText: {
            textAlign: 'center',
        },
    })
