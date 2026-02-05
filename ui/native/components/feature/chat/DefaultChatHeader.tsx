import { Text } from '@rneui/themed'
import React from 'react'

import Header from '../../ui/Header'

type Props = {
    title?: string
}

const DefaultChatHeader: React.FC<Props> = ({ title }) => {
    return (
        <Header
            backButton
            headerCenter={
                title ? (
                    <Text bold numberOfLines={1} adjustsFontSizeToFit>
                        {title}
                    </Text>
                ) : undefined
            }
        />
    )
}

export default DefaultChatHeader
