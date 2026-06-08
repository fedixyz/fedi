import React, { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'

import { styled } from '../../styles'
import { EmptyState } from '../EmptyState'
import { HoloLoader } from '../HoloLoader'
import { Text } from '../Text'
import {
    HistoryDetailDialog,
    HistoryDetailDialogProps,
} from './HistoryDetailDialog'
import { HistoryRow, HistoryRowProps } from './HistoryRow'
import { HistoryRowError } from './HistoryRowError'

const PAGINATION_THRESHOLD_PX = 0

interface Props<T extends { id: string }> {
    rows: T[]
    loading?: boolean
    makeRowProps: (item: T) => Omit<HistoryRowProps, 'icon' | 'onSelect'>
    makeDetailProps: (
        item: T,
    ) => Omit<HistoryDetailDialogProps, 'icon' | 'onClose'>
    makeIcon: (item: T) => React.ReactNode
    onEndReached?: () => Promise<unknown> | void
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
    const [selectedItem, setSelectedItem] = useState<T | null>(null)
    const paginationPendingRef = useRef(false)
    const hasPaginatedAtBoundaryRef = useRef(false)

    const handleScroll = useCallback(
        (ev: React.UIEvent<HTMLDivElement>) => {
            if (!onEndReached) return

            const { clientHeight, scrollHeight } = ev.currentTarget
            const scrollTop = Math.abs(ev.currentTarget.scrollTop)
            const isAtPaginationBoundary =
                scrollTop + clientHeight + PAGINATION_THRESHOLD_PX >=
                scrollHeight

            if (!isAtPaginationBoundary) {
                hasPaginatedAtBoundaryRef.current = false
                return
            }

            if (
                paginationPendingRef.current ||
                hasPaginatedAtBoundaryRef.current
            ) {
                return
            }

            hasPaginatedAtBoundaryRef.current = true
            paginationPendingRef.current = true
            Promise.resolve(onEndReached())
                .catch(() => null)
                .finally(() => {
                    paginationPendingRef.current = false
                })
        },
        [onEndReached],
    )

    if (loading) {
        return (
            <Loading>
                <HoloLoader size="xl" />
            </Loading>
        )
    }

    if (!rows.length) {
        return (
            <EmptyState>
                <Text>{t('phrases.no-transactions')}</Text>
            </EmptyState>
        )
    }

    return (
        <Container onScroll={onEndReached ? handleScroll : undefined}>
            {rows.map(item => (
                <ErrorBoundary
                    key={item.id}
                    fallback={({ error }) => (
                        <HistoryRowError item={item} error={error} />
                    )}>
                    <HistoryRow
                        {...makeRowProps(item)}
                        icon={makeIcon(item)}
                        onSelect={() => setSelectedItem(item)}
                    />
                </ErrorBoundary>
            ))}
            {selectedItem && (
                <HistoryDetailDialog
                    {...makeDetailProps(selectedItem)}
                    icon={makeIcon(selectedItem)}
                    onClose={() => setSelectedItem(null)}
                />
            )}
        </Container>
    )
}

const Loading = styled('div', {
    padding: '48px 16px 16px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
})

const Container = styled('div', {
    flex: 1,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',

    variants: {
        centered: {
            true: {
                justifyContent: 'center',
                alignItems: 'center',
            },
        },
    },
})
