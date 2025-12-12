import { useTranslation } from 'react-i18next'

import clockIcon from '@fedi/common/assets/svgs/clock.svg'
import { usePopupFederationInfo } from '@fedi/common/hooks/federation'
import { LoadedFederation } from '@fedi/common/types'

import { styled, theme } from '../../styles'
import { Row } from '../Flex'
import { Icon } from '../Icon'
import { Text } from '../Text'

export default function FederationPopupCountdown({
    federation,
}: {
    federation: LoadedFederation
}) {
    const { t } = useTranslation()
    const popupInfo = usePopupFederationInfo(federation?.meta || {})

    if (!popupInfo || popupInfo.ended) return null

    return (
        <FederationEndCard>
            <Row align="center" gap="sm" grow>
                <Icon icon={clockIcon} size={16} />
                <Text variant="caption">
                    {t('feature.federations.federation-ends-in')}
                </Text>
            </Row>
            <Text weight="medium">{popupInfo.endsInText}</Text>
        </FederationEndCard>
    )
}

const FederationEndCard = styled('div', {
    display: 'flex',
    padding: `${theme.spacing.md} ${theme.spacing.lg}`,
    borderRadius: 16,
    background: theme.colors.extraLightGrey,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
})
