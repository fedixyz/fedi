import { Text, useTheme, type Theme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { useBalance } from '@fedi/common/hooks/amount'
import { Federation, LoadedFederation } from '@fedi/common/types'

import { useStabilityPool } from '../../../state/hooks'
import { Column, Row } from '../../ui/Flex'
import { ImageBadge } from '../../ui/ImageBadge'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'
import { FederationLogo } from '../federations/FederationLogo'
import SelectFederationOverlay from '../send/SelectFederationOverlay'

type Props = {
    federation: LoadedFederation
    showSwitcher?: boolean
    onSelectFederation?: (federationId: Federation['id']) => void
    balanceDescription?: string
    badgeLogo?: 'usd' | 'btc'
    balance?: string
}

const StabilityBalanceTile = ({
    federation,
    onSelectFederation,
    showSwitcher = false,
    balanceDescription,
    badgeLogo,
    balance,
}: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const { formattedStableBalance } = useStabilityPool(federation.id)
    const { formattedBalanceFiat } = useBalance(t, federation.id)
    const [isDropdownOpen, setIsDropdownOpen] = useState(false)

    const style = styles(theme)

    return (
        <>
            <Pressable
                style={style.stabilityBalanceWidget}
                onPress={
                    showSwitcher ? () => setIsDropdownOpen(true) : undefined
                }>
                <Row align="center" gap="md">
                    <View style={{ flexShrink: 0 }}>
                        <ImageBadge
                            badge={
                                badgeLogo ? (
                                    <SvgImage
                                        name={
                                            badgeLogo === 'usd'
                                                ? 'UsdCircleFilled'
                                                : 'BitcoinCircle'
                                        }
                                        size={SvgImageSize.sm}
                                        color={
                                            badgeLogo === 'usd'
                                                ? theme.colors.mint
                                                : theme.colors.orange
                                        }
                                        containerStyle={style.badgeContainer}
                                    />
                                ) : null
                            }>
                            <FederationLogo federation={federation} size={36} />
                        </ImageBadge>
                    </View>
                    <Column gap="xs">
                        <Text
                            bold
                            caption
                            maxFontSizeMultiplier={1.5}
                            numberOfLines={1}>
                            {federation.name}
                        </Text>
                        <Text
                            medium
                            caption
                            maxFontSizeMultiplier={1.5}
                            numberOfLines={1}
                            color={theme.colors.darkGrey}>
                            {balanceDescription ||
                                t('feature.stabilitypool.available-balance')}
                            :{' '}
                            {balance
                                ? balance
                                : badgeLogo === 'usd'
                                  ? formattedStableBalance
                                  : formattedBalanceFiat}
                        </Text>
                    </Column>
                </Row>
                {showSwitcher && (
                    <SvgImage
                        name="ChevronDown"
                        size={theme.sizes.sm}
                        color={theme.colors.black}
                    />
                )}
            </Pressable>
            {showSwitcher && (
                <SelectFederationOverlay
                    opened={isDropdownOpen}
                    onDismiss={() => setIsDropdownOpen(false)}
                    onSelect={f => {
                        setIsDropdownOpen(false)
                        onSelectFederation?.(f.id)
                    }}
                    selectedFederation={federation.id}
                    showStableBalance={true}
                />
            )}
        </>
    )
}

export const styles = (theme: Theme) =>
    StyleSheet.create({
        stabilityBalanceWidget: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: theme.spacing.md,
            backgroundColor: theme.colors.grey50,
            borderRadius: 16,
            width: '100%',
        },
        stableBalanceLink: {
            color: theme.colors.primary,
            textDecorationLine: 'underline',
        },
        tooltipContent: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            padding: theme.spacing.sm,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
        },
        tooltipText: {
            textAlign: 'center',
        },
        badgeContainer: {
            backgroundColor: theme.colors.offWhite,
            borderRadius: 100,
        },
    })

export default StabilityBalanceTile
