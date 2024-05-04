import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import Header from '../../ui/Header'
import SelectedFederationHeader from '../federations/SelectedFederationHeader'

const NewMemberHeader: React.FC = () => {
    const { t } = useTranslation()

    return (
        <>
            <SelectedFederationHeader />
            <Header
                inline
                headerCenter={
                    <Text bold numberOfLines={1} adjustsFontSizeToFit>
                        {t('phrases.new-member')}
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
