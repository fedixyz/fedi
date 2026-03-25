import { useRouter } from 'next/router'
import React from 'react'
import { useTranslation } from 'react-i18next'

import ChevronRightIcon from '@fedi/common/assets/svgs/chevron-right.svg'
import { theme } from '@fedi/common/constants/theme'
import { Community } from '@fedi/common/types'

import { communityRoute } from '../constants/routes'
import { styled } from '../styles'
import { FederationAvatar } from './FederationAvatar'
import { Column, Row } from './Flex'
import { Icon } from './Icon'
import { Text } from './Text'

export type Props = {
    community: Community
}

const SelectedCommunity: React.FC<Props> = ({ community }) => {
    const router = useRouter()
    const { t } = useTranslation()

    return (
        <Container
            align="center"
            justify="between"
            gap="md"
            onClick={() => router.push(communityRoute(community.id))}>
            <Row>
                <FederationAvatar federation={community} size="md" />
            </Row>

            <Column grow>
                <Text variant="h2" weight="bold">
                    {community?.name}
                </Text>
                {community.status === 'deleted' && (
                    <Text variant="caption" css={{ color: theme.colors.red }}>
                        {t('feature.communities.community-deleted')}
                    </Text>
                )}
            </Column>

            <Row align="center" shrink={false}>
                <Icon
                    icon={ChevronRightIcon}
                    size="sm"
                    color={theme.colors.primary}
                />
            </Row>
        </Container>
    )
}

const Container = styled(Row, {
    cursor: 'pointer',
    width: '100%',
})

export default SelectedCommunity
