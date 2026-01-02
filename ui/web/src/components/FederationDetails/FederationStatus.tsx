import { useTranslation } from 'react-i18next'

import offlineIcon from '@fedi/common/assets/svgs/alert-warning-triangle.svg'
import onlineIcon from '@fedi/common/assets/svgs/dot.svg'
import unstableIcon from '@fedi/common/assets/svgs/info.svg'
import { theme } from '@fedi/common/constants/theme'
import { useFederationStatus } from '@fedi/common/hooks/federation'

import { styled } from '../../styles'
import { Row } from '../Flex'
import { Icon } from '../Icon'
import { Text } from '../Text'

export function FederationStatus({ federationId }: { federationId: string }) {
    const { t } = useTranslation()

    const {
        statusText,
        statusMessage,
        statusIcon,
        statusIconColor,
        statusWord,
    } = useFederationStatus({
        federationId,
        t,
        statusIconMap: {
            offline: offlineIcon,
            online: onlineIcon,
            unstable: unstableIcon,
        },
    })

    return (
        <FederationStatusCard>
            <FederationStatusHeader>
                <Text variant="caption" css={{ flexGrow: 1 }}>
                    {statusText}
                </Text>
                <Row center gap="xs">
                    <Icon icon={statusIcon} color={statusIconColor} size={12} />
                    <Text variant="caption">{statusWord}</Text>
                </Row>
            </FederationStatusHeader>
            <Text variant="caption">{statusMessage}</Text>
        </FederationStatusCard>
    )
}

const FederationStatusCard = styled('div', {
    border: `solid 1px ${theme.colors.extraLightGrey}`,
    borderRadius: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
})

const FederationStatusHeader = styled('div', {
    alignItems: 'center',
    borderBottom: `1px solid ${theme.colors.extraLightGrey}`,
    display: 'flex',
    padding: '5px 0',
})
