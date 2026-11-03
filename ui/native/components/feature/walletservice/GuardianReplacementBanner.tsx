import { Text, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import type {
    RpcFaGuardianTransfer,
    RpcFaReplacementCandidate,
} from '@fedi/common/types/bindings'

import { Pressable } from '../../ui/Pressable'
import {
    WarningBanner,
    WarningBannerLevel,
    getWarningBannerAccent,
} from '../../ui/WarningBanner'

/**
 * The dashboard's line about guardian replacement: an open replacement and
 * where it stands, or else the guardians the latest check flagged. Nothing
 * when there is neither.
 */
export const GuardianReplacementBanner: React.FC<{
    /** The open replacement; a completed one is not shown. */
    transfer: RpcFaGuardianTransfer | null | undefined
    candidates: RpcFaReplacementCandidate[]
    /** Null until the guardians' statuses are read. */
    hasQuorum: boolean | null
    onViewTransfer: () => void
    onReviewCandidates: () => void
}> = ({
    transfer,
    candidates,
    hasQuorum,
    onViewTransfer,
    onReviewCandidates,
}) => {
    const { t } = useTranslation()

    if (transfer && transfer.phase !== 'completed') {
        const names = {
            name: transfer.sourceMgName,
            destination: transfer.destinationMgName,
        }
        const message =
            transfer.phase === 'buyingSeat'
                ? t('feature.wallet-service.replace-banner-paying', names)
                : transfer.phase === 'awaitingSource'
                  ? t('feature.wallet-service.replace-banner-waiting', names)
                  : t('feature.wallet-service.replace-banner-finishing', names)
        const level = 'info'
        return (
            <BannerPressable
                testID="wallet-service-replacement-progress"
                onPress={onViewTransfer}>
                <WarningBanner
                    level={level}
                    icon="Info"
                    title={t(
                        'feature.wallet-service.replace-banner-progress-title',
                        names,
                    )}
                    message={message}
                    action={
                        <BannerAction
                            level={level}
                            label={t(
                                'feature.wallet-service.replace-banner-view',
                            )}
                        />
                    }
                />
            </BannerPressable>
        )
    }

    if (candidates.length === 0) return null
    const isOne = candidates.length === 1
    return (
        <BannerPressable
            testID="wallet-service-replacement-banner"
            onPress={onReviewCandidates}>
            <WarningBanner
                level="warning"
                icon="AlertWarningTriangleOutline"
                title={
                    isOne
                        ? t('feature.wallet-service.replace-banner-title-one')
                        : t(
                              'feature.wallet-service.replace-banner-title-many',
                              {
                                  count: candidates.length,
                              },
                          )
                }
                message={
                    hasQuorum === false
                        ? t(
                              'feature.wallet-service.replace-banner-body-below-quorum',
                          )
                        : isOne
                          ? t(
                                'feature.wallet-service.replace-banner-body-one',
                                { name: candidates[0].mgName },
                            )
                          : t('feature.wallet-service.replace-banner-body-many')
                }
                action={
                    <BannerAction
                        level="warning"
                        label={t(
                            'feature.wallet-service.replace-banner-review',
                        )}
                    />
                }
            />
        </BannerPressable>
    )
}

const BannerPressable: React.FC<{
    testID: string
    onPress: () => void
    children: React.ReactNode
}> = ({ testID, onPress, children }) => (
    <Pressable
        testID={testID}
        containerStyle={styles.pressable}
        onPress={onPress}>
        {children}
    </Pressable>
)

/** The banner's call to action, as a link line: the whole banner is the tap. */
const BannerAction: React.FC<{
    label: string
    level: WarningBannerLevel
}> = ({ label, level }) => {
    const { theme } = useTheme()
    return (
        <Text small bold color={getWarningBannerAccent(theme, level)}>
            {`${label} ›`}
        </Text>
    )
}

const styles = StyleSheet.create({
    pressable: {
        // the shared Pressable pads both axes by name; the banner has its own
        paddingHorizontal: 0,
        paddingVertical: 0,
    },
})
