import { Text, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { useBalance } from '@fedi/common/hooks/amount'
import { selectLoadedFederation } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import { Column, Row } from '../../ui/Flex'
import { FederationLogo } from './FederationLogo'

export default function FederationBalance({
    federationId,
}: {
    federationId: string
}) {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const { formattedBalance } = useBalance(t, federationId)

    const federation = useAppSelector(s =>
        selectLoadedFederation(s, federationId),
    )

    const style = styles(theme)

    return (
        federation && (
            <Row style={style.container} align="center" gap="sm">
                <FederationLogo federation={federation} size={36} />
                <Column grow>
                    <Text medium>{federation.name}</Text>
                    <Text color={theme.colors.grey} caption>
                        {formattedBalance}
                    </Text>
                </Column>
            </Row>
        )
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            backgroundColor: theme.colors.grey50,
            padding: theme.spacing.md,
            borderRadius: 16,
        },
    })
