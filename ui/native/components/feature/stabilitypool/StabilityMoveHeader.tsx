import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { Row } from '../../ui/Flex'
import Header from '../../ui/Header'
import { StabilityInfoIcon } from './StabilityInfoIcon'

const StabilityMoveHeader: React.FC = () => {
    const { t } = useTranslation()

    return (
        <>
            <Header
                backButton
                headerCenter={<Text bold>{t('phrases.move-money')}</Text>}
                headerRight={
                    <Row gap="md">
                        <StabilityInfoIcon />
                    </Row>
                }
            />
        </>
    )
}

export default StabilityMoveHeader
