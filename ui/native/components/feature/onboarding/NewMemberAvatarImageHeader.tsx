import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import Header from '../../ui/Header'

const NewMemberAvatarImageHeader: React.FC = () => {
    const { t } = useTranslation()
    return (
        <>
            <Header
                headerCenter={
                    <Text bold numberOfLines={1} adjustsFontSizeToFit>
                        {t('feature.chat.add-an-avatar')}
                    </Text>
                }
                centerContainerStyle={{
                    flex: 3,
                }}
            />
        </>
    )
}

export default NewMemberAvatarImageHeader
