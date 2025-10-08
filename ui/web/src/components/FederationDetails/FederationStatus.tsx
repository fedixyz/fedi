import { useTranslation } from 'react-i18next'

import offlineIcon from '@fedi/common/assets/svgs/alert-warning-triangle.svg'
import unstableIcon from '@fedi/common/assets/svgs/info.svg'
import onlineIcon from '@fedi/common/assets/svgs/online-dot.svg'
import { theme } from '@fedi/common/constants/theme'
import { usePopupFederationInfo } from '@fedi/common/hooks/federation'
import { selectIsInternetUnreachable } from '@fedi/common/redux'
import { LoadedFederation } from '@fedi/common/types'

import { useAppSelector } from '../../hooks'
import { styled } from '../../styles'
import { Row } from '../Flex'
import { Icon } from '../Icon'
import { Text } from '../Text'

export function FederationStatus({
    federation,
}: {
    federation: LoadedFederation
}) {
    const { t } = useTranslation()

    const status = federation.status || 'offline'
    const isOffline = useAppSelector(selectIsInternetUnreachable)
    const popupInfo = usePopupFederationInfo(federation?.meta || {})

    let statusMessage = t('feature.federations.connection-status-offline')
    let statusIcon = offlineIcon
    let statusIconColor = theme.colors.red
    let statusWord = t('words.offline')

    if (status === 'online') {
        statusIcon = onlineIcon
        statusIconColor = theme.colors.success
        statusWord = t('words.online')
        statusMessage = t('feature.federations.connection-status-online')
    } else if (status === 'unstable') {
        statusIcon = unstableIcon
        statusWord = t('words.unstable')
        statusMessage = t('feature.federations.connection-status-unstable')
    }

    if (popupInfo?.ended) {
        statusIcon = onlineIcon
        statusWord = t('words.expired')
        statusIconColor = theme.colors.grey
    }

    return (
        <FederationStatusCard>
            <FederationStatusHeader>
                <Text variant="caption" css={{ flexGrow: 1 }}>
                    {isOffline
                        ? t('feature.federations.last-known-status')
                        : t('words.status')}
                </Text>
                <Row center gap="xs">
                    <Icon icon={statusIcon} color={statusIconColor} size={12} />
                    <Text variant="caption">{statusWord}</Text>
                </Row>
            </FederationStatusHeader>
            <Text variant="caption">
                {isOffline
                    ? t('feature.federations.please-reconnect')
                    : statusMessage}
            </Text>
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
