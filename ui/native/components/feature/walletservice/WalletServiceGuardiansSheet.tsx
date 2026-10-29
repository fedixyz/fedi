import { Button, Text, Theme, useTheme } from '@rneui/themed'
import { TFunction } from 'i18next'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, View } from 'react-native'

import { LoadedFederation } from '@fedi/common/types'
import type {
    GuardianStatus,
    RpcFaReplacementCandidate,
} from '@fedi/common/types/bindings'
import {
    guardianQuorum,
    readGuardianStatus,
} from '@fedi/common/utils/federationHealth'

import { Column, Row } from '../../ui/Flex'
import { ScreenTitle } from '../../ui/ScreenTitle'
import { SheetDescription } from '../../ui/SheetDescription'
import { SummaryRow } from '../../ui/SummaryRow'
import { WarningBanner } from '../../ui/WarningBanner'
import { MilestoneSpinner } from './MilestoneSpinner'
import {
    ServiceSettingsDivider,
    ServiceSettingsSection,
} from './ServiceSettingsRow'
import { ServiceSheet } from './ServiceSheet'
import {
    describeReplacementReason,
    mostRelevantReason,
    replacementQuorumLine,
    summarizeReplacementReason,
} from './replacementReasons'

export const GuardiansOfflineBanner: React.FC<{ total: number }> = ({
    total,
}) => {
    const { t } = useTranslation()
    return (
        <WarningBanner
            level="error"
            message={t('feature.wallet-service.federation-offline', {
                quorum: guardianQuorum(total),
                total,
            })}
        />
    )
}

/**
 * What the sheet says about guardian replacement. Omitted for a service that
 * cannot replace guardians, which then shows only who responds.
 */
export type GuardiansSheetReplacement = {
    /** Guardians the latest check flagged, still in their seats. */
    candidates: RpcFaReplacementCandidate[]
    /** The guardian an open replacement is moving off, if one is open. */
    replacingName: string | null
    /** False while a replacement is open or not yet read. */
    canStart: boolean
    onReplace: (seatIndex: number) => void
}

/**
 * The flagged guardian a status row describes.
 *
 * Matched by name, the one thing both carry: the rows are in peer order, and a
 * candidate indexes the formation's own seat list. Both names derive from the
 * MG id, and a name that is missing, or shared by two rows or two candidates,
 * matches nothing.
 */
const findCandidate = (
    candidates: RpcFaReplacementCandidate[],
    rowNames: (string | null)[],
    mgName: string | null,
) => {
    if (!mgName) return undefined
    if (rowNames.filter(name => name === mgName).length !== 1) return undefined
    const matches = candidates.filter(c => c.mgName === mgName)
    return matches.length === 1 ? matches[0] : undefined
}

type RowState = 'online' | 'notResponding' | 'unreliable' | 'replacing'

const ROW_ORDER: Record<RowState, number> = {
    unreliable: 0,
    replacing: 1,
    notResponding: 2,
    online: 3,
}

/** Why the check flagged a guardian, in numbers, before any price is asked. */
const ReplaceReasons: React.FC<{ candidate: RpcFaReplacementCandidate }> = ({
    candidate,
}) => {
    const { t } = useTranslation()
    return (
        <Column testID="wallet-service-replace-reasons" fullWidth>
            {candidate.reasons.map((reason, index) => {
                const { label, value } = summarizeReplacementReason(reason, t)
                return (
                    <SummaryRow
                        key={reason.type}
                        isFirst={index === 0}
                        label={label}
                        value={value}
                    />
                )
            })}
        </Column>
    )
}

type SheetGuardian = {
    guardian: ReturnType<typeof readGuardianStatus> & { seat: number }
    candidate: RpcFaReplacementCandidate | undefined
    state: RowState
}

const guardianName = (guardian: SheetGuardian['guardian'], t: TFunction) =>
    guardian.mg_name ??
    t('feature.wallet-service.guardian-fallback-name', {
        number: guardian.seat,
    })

/**
 * One colour per state: orange only where the user has to act, blue for a
 * replacement under way, as on every screen that shows one.
 */
const useRowDot = (state: RowState) => {
    const { theme } = useTheme()
    return {
        online: theme.colors.success,
        notResponding: theme.colors.grey,
        unreliable: theme.colors.orange,
        replacing: theme.colors.blue,
    }[state]
}

/** The replacing spinner's size, and so the width of the status column. */
const STATUS_SIZE = 14

const Dot: React.FC<{ color: string; testID: string }> = ({
    color,
    testID,
}) => {
    const { theme } = useTheme()
    return (
        <Row
            style={[styles(theme).dot, { backgroundColor: color }]}
            testID={testID}
        />
    )
}

/**
 * A settings-card row: dot, name, an optional line under, then an optional
 * action. The section above names the state, so the row does not repeat it.
 */
const GuardianRow: React.FC<{
    item: SheetGuardian
    testID: string
    detail?: string
    trailing?: React.ReactNode
}> = ({ item, testID, detail, trailing }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const dot = useRowDot(item.state)
    const style = styles(theme)
    return (
        <Row align="center" gap="md" style={style.row} testID={testID}>
            {/* one column width, so every name lines up */}
            <Row center style={style.status}>
                {item.state === 'replacing' ? (
                    <MilestoneSpinner size={STATUS_SIZE} />
                ) : (
                    <Dot color={dot} testID={`${testID}-dot`} />
                )}
            </Row>
            <Column grow shrink gap={2}>
                <Text style={style.rowName} numberOfLines={1}>
                    {guardianName(item.guardian, t)}
                </Text>
                {detail ? <Text style={style.rowDetail}>{detail}</Text> : null}
            </Column>
            {trailing}
        </Row>
    )
}

/**
 * The guardians grouped by what they need: the flagged ones first, each with
 * the reason that matters most and a Replace, then the rest. Row test ids
 * count through all the groups, in the order shown.
 */
const GroupedList: React.FC<{
    guardians: SheetGuardian[]
    canReplace: boolean
    canStart: boolean
    onReview: (candidate: RpcFaReplacementCandidate) => void
}> = ({ guardians, canReplace, canStart, onReview }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const style = styles(theme)
    const groups: { title: string; states: RowState[] }[] = [
        {
            title: t(
                'feature.wallet-service.guardians-section-needs-replacing',
            ),
            states: ['unreliable'],
        },
        {
            title: t('feature.wallet-service.guardians-section-replacing'),
            states: ['replacing'],
        },
        {
            title: t('feature.wallet-service.guardians-section-not-responding'),
            states: ['notResponding'],
        },
        {
            title: t('feature.wallet-service.guardians-section-healthy'),
            states: ['online'],
        },
    ]

    const shown = groups
        .map(group => ({
            ...group,
            items: guardians.filter(g => group.states.includes(g.state)),
        }))
        .filter(group => group.items.length > 0)
    // one group needs no name: the header above already says it
    const isOneGroup = shown.length === 1

    return (
        <Column gap="lg">
            {shown.map(({ title, items }) => {
                return (
                    <ServiceSettingsSection
                        key={title}
                        title={isOneGroup ? undefined : title}>
                        {items.map((item, i) => {
                            const { candidate } = item
                            const reason =
                                candidate &&
                                mostRelevantReason(candidate.reasons)
                            const detail = reason
                                ? describeReplacementReason(reason, t)
                                : item.state === 'notResponding' && canReplace
                                  ? t(
                                        'feature.wallet-service.guardian-not-responding-detail',
                                    )
                                  : undefined
                            return (
                                <View key={item.guardian.guardian}>
                                    {i > 0 && <ServiceSettingsDivider />}
                                    <GuardianRow
                                        item={item}
                                        testID={`wallet-service-guardian-${guardians.indexOf(item)}`}
                                        detail={detail}
                                        trailing={
                                            candidate && canStart ? (
                                                <Button
                                                    size="sm"
                                                    outline
                                                    buttonStyle={
                                                        style.replaceButton
                                                    }
                                                    titleStyle={
                                                        style.replaceTitle
                                                    }
                                                    testID={`wallet-service-guardian-replace-${candidate.seatIndex}`}
                                                    title={t(
                                                        'feature.wallet-service.guardian-replace',
                                                    )}
                                                    onPress={() =>
                                                        onReview(candidate)
                                                    }
                                                />
                                            ) : undefined
                                        }
                                    />
                                </View>
                            )
                        })}
                    </ServiceSettingsSection>
                )
            })}
        </Column>
    )
}

export const WalletServiceGuardiansSheet: React.FC<{
    show: boolean
    statuses: GuardianStatus[]
    federationStatus: LoadedFederation['status']
    statusColor: string
    replacement?: GuardiansSheetReplacement
    onDismiss: () => void
}> = ({
    show,
    statuses,
    federationStatus,
    statusColor,
    replacement,
    onDismiss,
}) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const style = styles(theme)
    // the flagged guardian whose reasons are up instead of the list
    const [reviewing, setReviewing] =
        useState<RpcFaReplacementCandidate | null>(null)
    // every opening starts at the list
    useEffect(() => {
        if (!show) setReviewing(null)
    }, [show])

    const candidates = replacement?.candidates ?? []
    const rowNames = statuses.map(status => readGuardianStatus(status).mg_name)
    const guardians = statuses
        .map((status, index) => {
            const guardian = { ...readGuardianStatus(status), seat: index + 1 }
            const candidate = findCandidate(
                candidates,
                rowNames,
                guardian.mg_name,
            )
            const state: RowState =
                replacement?.replacingName &&
                guardian.mg_name === replacement.replacingName
                    ? 'replacing'
                    : candidate
                      ? 'unreliable'
                      : guardian.isResponding
                        ? 'online'
                        : 'notResponding'
            return { guardian, candidate, state }
        })
        .sort((a, b) => ROW_ORDER[a.state] - ROW_ORDER[b.state])
    const total = guardians.length
    const online = guardians.filter(g => g.guardian.isResponding).length
    const flagged = guardians.filter(g => g.state === 'unreliable')

    if (reviewing && replacement) {
        return (
            <ServiceSheet
                show={show}
                title={t('feature.wallet-service.replace-why-title', {
                    name: reviewing.mgName,
                })}
                description={t('feature.wallet-service.replace-why-body', {
                    name: reviewing.mgName,
                })}
                note={[
                    t('feature.wallet-service.replace-why-note'),
                    replacementQuorumLine(online >= guardianQuorum(total), t),
                ]
                    .filter(Boolean)
                    .join(' ')}
                onDismiss={onDismiss}
                buttons={[
                    {
                        text: t('feature.wallet-service.replace-get-quote'),
                        primary: true,
                        testID: 'wallet-service-replace-get-quote',
                        onPress: () =>
                            replacement.onReplace(reviewing.seatIndex),
                    },
                    {
                        text: t('phrases.not-now'),
                        testID: 'wallet-service-replace-not-now',
                        onPress: () => setReviewing(null),
                    },
                ]}>
                <ReplaceReasons candidate={reviewing} />
            </ServiceSheet>
        )
    }

    const quorum = guardianQuorum(total)
    // the counts are what the sheet shows, so the line agrees with them
    const description =
        online === total
            ? t('feature.wallet-service.federation-online')
            : online >= quorum
              ? t('feature.wallet-service.federation-online-degraded', {
                    quorum,
                    total,
                })
              : t('feature.wallet-service.federation-below-quorum', {
                    quorum,
                    total,
                })
    const flaggedLine =
        flagged.length === 1
            ? t('feature.wallet-service.guardians-replace-one')
            : flagged.length > 1
              ? t('feature.wallet-service.guardians-replace-many', {
                    count: flagged.length,
                })
              : null

    return (
        <ServiceSheet
            show={show}
            tall
            onDismiss={onDismiss}
            buttons={[
                {
                    text: t('words.done'),
                    primary: true,
                    onPress: onDismiss,
                },
            ]}>
            <Column gap="xs">
                <Row align="center" gap="sm">
                    <Row
                        testID="wallet-service-guardians-status-dot"
                        style={[style.dot, { backgroundColor: statusColor }]}
                    />
                    <ScreenTitle>
                        {t('feature.wallet-service.guardians-count', {
                            online,
                            total,
                        })}
                    </ScreenTitle>
                </Row>
                {federationStatus === 'offline' ? (
                    <GuardiansOfflineBanner total={total} />
                ) : (
                    <SheetDescription>
                        {flaggedLine
                            ? `${description} ${flaggedLine}`
                            : description}
                    </SheetDescription>
                )}
            </Column>
            <ScrollView
                testID="wallet-service-guardians-list"
                style={style.list}
                contentContainerStyle={style.listContent}>
                <GroupedList
                    guardians={guardians}
                    canReplace={!!replacement}
                    canStart={!!replacement?.canStart}
                    onReview={setReviewing}
                />
            </ScrollView>
        </ServiceSheet>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        list: {
            flexShrink: 1,
            width: '100%',
        },
        listContent: {
            paddingVertical: theme.spacing.xs,
        },
        row: {
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: 16,
        },
        rowName: {
            color: theme.colors.primary,
            fontSize: 16,
            fontWeight: '500',
        },
        rowDetail: {
            color: theme.colors.darkGrey,
            fontSize: 14,
        },
        replaceButton: {
            height: 32,
            minHeight: 32,
            paddingHorizontal: 16,
            paddingVertical: 0,
        },
        replaceTitle: {
            fontSize: 14,
        },
        status: {
            width: STATUS_SIZE,
        },
        dot: {
            borderRadius: 999,
            height: 7,
            width: 7,
        },
    })
