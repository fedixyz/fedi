import { Text, useTheme, type Theme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { selectLoadedFederation } from '@fedi/common/redux'
import { Federation } from '@fedi/common/types'

import { useAppSelector, useStabilityPool } from '../../../state/hooks'
import Flex, { Row } from '../../ui/Flex'
import { ImageBadge } from '../../ui/ImageBadge'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'
import { FederationLogo } from '../federations/FederationLogo'

type Props = {
    federationId: Federation['id']
    showSwitcher?: boolean
    onSelectFederation?: (federationId: Federation['id']) => void
    balanceDescription?: string
    badgeLogo?: 'usd' | 'btc'
}

const StabilityBalanceTile = ({
    federationId,
    balanceDescription,
    badgeLogo = 'usd',
}: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const federation = useAppSelector(s =>
        selectLoadedFederation(s, federationId),
    )
    const { formattedStableBalance } = useStabilityPool(federationId)

    if (!federation) return null

    const style = styles(theme)

    return (
        <View style={style.stabilityBalanceWidget}>
            <Row align="center" gap="md">
                <View style={{ flexShrink: 0 }}>
                    <ImageBadge
                        badge={
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
                        }>
                        <FederationLogo federation={federation} size={36} />
                    </ImageBadge>
                </View>
                <Flex gap="xs">
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
                        : {formattedStableBalance}
                    </Text>
                </Flex>
            </Row>
        </View>
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
        badgeContainer: {
            backgroundColor: theme.colors.offWhite,
            borderRadius: 100,
        },
    })

export default StabilityBalanceTile
