import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import {
    selectCurrency,
    selectFederationBalance,
    selectLoadedFederation,
} from '@fedi/common/redux'
import { Federation } from '@fedi/common/types'

import { useAppSelector } from '../../../state/hooks'
import { Row } from '../../ui/Flex'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

export type Props = {
    federationId: Federation['id']
}
export const StabilityBitcoinBanner: React.FC<Props> = ({ federationId }) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const currency = useAppSelector(s => selectCurrency(s, federationId))
    const federation = useAppSelector(s =>
        selectLoadedFederation(s, federationId),
    )
    const balance = useAppSelector(s =>
        selectFederationBalance(s, federationId),
    )

    if (!federation || balance > 0) return null

    const style = styles(theme)

    return (
        <Row
            align="start"
            justify="center"
            gap="xs"
            fullWidth
            style={style.container}>
            <SvgImage
                color={theme.colors.night}
                name="Info"
                size={SvgImageSize.xs}
            />
            <Text small medium style={style.text}>
                {t('feature.stabilitypool.no-bitcoin-notice', {
                    currency,
                })}
            </Text>
        </Row>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            padding: theme.spacing.sm,
            backgroundColor: '#FFFAEB', // TODO: add to theme.colors
        },
        text: {
            color: theme.colors.night,
        },
    })
