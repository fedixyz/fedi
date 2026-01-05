import { Text, Theme, useTheme } from '@rneui/themed'
import capitalize from 'lodash/capitalize'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { selectLoadedFederation } from '@fedi/common/redux'
import { Federation } from '@fedi/common/types'

import { useAppSelector } from '../../../state/hooks'
import { Row } from '../../ui/Flex'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

export type Props = {
    federationId: Federation['id']
}

export const NetworkBanner: React.FC<Props> = ({ federationId }) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const federation = useAppSelector(s =>
        selectLoadedFederation(s, federationId),
    )

    if (!federation || federation.network === 'bitcoin') return null

    const style = styles(theme)
    return (
        <Row center gap="xs" fullWidth>
            <SvgImage
                color={theme.colors.night}
                name="Info"
                size={SvgImageSize.xs}
                maxFontSizeMultiplier={1.2}
            />
            <Text
                small
                medium
                style={style.text}
                adjustsFontSizeToFit
                numberOfLines={1}>
                {t('feature.wallet.network-notice', {
                    network: capitalize(federation.network ?? 'unknown'),
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
