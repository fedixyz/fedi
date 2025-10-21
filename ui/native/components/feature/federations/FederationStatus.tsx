import { Divider, Text, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { useFederationStatus } from '@fedi/common/hooks/federation'

import { Column, Row } from '../../ui/Flex'
import SvgImage, { SvgImageName } from '../../ui/SvgImage'

const FederationStatus = ({ federationId }: { federationId: string }) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const style = styles(theme)

    const {
        statusText,
        statusMessage,
        statusIcon,
        statusIconColor,
        statusWord,
    } = useFederationStatus<SvgImageName>({
        federationId,
        t,
        statusIconMap: {
            offline: 'Offline',
            online: 'Online',
            unstable: 'Info',
        },
    })

    return (
        <Column gap="sm" style={style.federationStatusCard}>
            <Row align="center" justify="between">
                <Column shrink>
                    <Text caption maxFontSizeMultiplier={1.2}>
                        {statusText}
                    </Text>
                </Column>
                <Row center shrink={false} gap="xs">
                    <SvgImage
                        size={16}
                        name={statusIcon}
                        color={statusIconColor}
                    />
                    <Text
                        medium
                        caption
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        maxFontSizeMultiplier={1.4}>
                        {statusWord}
                    </Text>
                </Row>
            </Row>
            <Divider />
            <Text caption>{statusMessage}</Text>
        </Column>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        federationStatusCard: {
            borderWidth: 1,
            borderColor: theme.colors.extraLightGrey,
            borderRadius: 20,
            padding: theme.spacing.lg,
        },
    })

export default FederationStatus
