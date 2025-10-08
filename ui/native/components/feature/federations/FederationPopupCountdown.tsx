import { Divider, Text, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { usePopupFederationInfo } from '@fedi/common/hooks/federation'

import { LoadedFederation } from '../../../types'
import { Column, Row } from '../../ui/Flex'
import SvgImage from '../../ui/SvgImage'

const FederationPopupCountdown = ({
    federation,
}: {
    federation: LoadedFederation
}) => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    const popupInfo = usePopupFederationInfo(federation?.meta ?? {})

    const style = styles(theme)

    if (!popupInfo || popupInfo.ended) return null

    return (
        <Column gap="md" style={style.popupFederationCard}>
            <Row align="center" justify="between" gap="md">
                <Row gap="sm" align="center">
                    <SvgImage name="Clock" size={16} />
                    <Text caption>
                        {t('feature.federations.federation-ends-in')}
                    </Text>
                </Row>
                <Text medium>{popupInfo.endsInText}</Text>
            </Row>
            {popupInfo.countdownMessage && (
                <>
                    <Divider />
                    <Text caption>{popupInfo.countdownMessage}</Text>
                </>
            )}
        </Column>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        popupFederationCard: {
            paddingVertical: theme.spacing.md,
            paddingHorizontal: theme.spacing.lg,
            borderRadius: theme.borders.defaultRadius,
            borderWidth: 1,
            borderColor: theme.colors.extraLightGrey,
        },
    })

export default FederationPopupCountdown
