import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import Header from '../../ui/Header'

const NewMemberHeader: React.FC = () => {
    const { t } = useTranslation()

    return (
        <>
            <Header
                backButton
                headerCenter={
                    <Text bold numberOfLines={1} adjustsFontSizeToFit>
                        {t('feature.chat.create-a-display-name')}
                    </Text>
                }
                centerContainerStyle={{
                    flex: 3,
                }}
            />
        </>
    )
}

export default NewMemberHeader
