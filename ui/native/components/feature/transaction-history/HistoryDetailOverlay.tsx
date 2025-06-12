import { Theme, useTheme, Button } from '@rneui/themed'
import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text } from 'react-native'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import { FeeItem } from '@fedi/common/hooks/transactions'

import { useLaunchZendesk } from '../../../utils/hooks/support'
import CenterOverlay from '../../ui/CenterOverlay'
import Flex from '../../ui/Flex'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'
import { FeeBreakdown } from '../send/FeeBreakdown'
import { HistoryDetail, HistoryDetailProps } from './HistoryDetail'

type HistoryDetailOverlayProps = {
    show: boolean
    itemDetails?: HistoryDetailProps
    feeItems: FeeItem[]
    showAskFedi: boolean
}

const HistoryDetailOverlay: React.FC<HistoryDetailOverlayProps> = ({
    show,
    itemDetails,
    feeItems,
    showAskFedi,
}) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const [showFeeBreakdown, setShowFeeBreakdown] = useState(false)

    const style = styles(theme)
    const { launchZendesk } = useLaunchZendesk()

    const content = useMemo(() => {
        if (!itemDetails) return <></>
        const totalFeeItem = feeItems.find(
            item => item.label === t('phrases.total-fees'),
        )
        return !showFeeBreakdown ? (
            <HistoryDetail
                {...itemDetails}
                fees={totalFeeItem?.formattedAmount}
                onPressFees={() => setShowFeeBreakdown(true)}
            />
        ) : (
            <FeeBreakdown
                showBack
                onPressBack={() => setShowFeeBreakdown(false)}
                title={t('phrases.fee-details')}
                icon={
                    <SvgImage name="Info" size={32} color={theme.colors.blue} />
                }
                feeItems={feeItems.map(
                    ({ label, formattedAmount }: FeeItem) => ({
                        label: label,
                        value: formattedAmount,
                    }),
                )}
                onClose={() => setShowFeeBreakdown(false)}
            />
        )
    }, [t, theme, itemDetails, showFeeBreakdown, feeItems])

    if (!itemDetails) return <></>

    return (
        <CenterOverlay
            key="detail-overlay"
            show={show}
            onBackdropPress={itemDetails.onClose}
            overlayStyle={style.overlayStyle}>
            <ErrorBoundary
                fallback={
                    <Flex center style={style.overlayErrorContainer}>
                        <SvgImage
                            name="Error"
                            color={theme.colors.red}
                            size={SvgImageSize.lg}
                        />
                        <Text style={style.overlayErrorText}>
                            {t('errors.history-render-error')}
                        </Text>
                    </Flex>
                }>
                {content}
            </ErrorBoundary>
            {showAskFedi && (
                <Button
                    fullWidth
                    title={
                        <Flex row gap="sm" align="center">
                            <SvgImage
                                name="SmileMessage"
                                color={theme.colors.white}
                                size={SvgImageSize.sm}
                            />
                            <Text style={style.askFediText}>
                                {t('feature.support.title')}
                            </Text>
                        </Flex>
                    }
                    onPress={() => {
                        itemDetails.onClose()
                        setTimeout(() => launchZendesk(), 300)
                    }}
                    containerStyle={{ marginTop: theme.spacing.lg }}
                />
            )}
        </CenterOverlay>
    )
}

export default HistoryDetailOverlay

const styles = (theme: Theme) =>
    StyleSheet.create({
        overlayStyle: {
            maxWidth: 340,
            alignItems: 'stretch',
        },
        overlayErrorContainer: {
            paddingVertical: theme.spacing.xl,
        },
        overlayErrorText: {
            marginTop: theme.spacing.lg,
            textAlign: 'center',
        },
        askFediText: {
            color: theme.colors.white,
            fontSize: 16,
            fontWeight: '500',
        },
    })
