import { Text } from '@rneui/themed'
import React from 'react'

import Header from './Header'

type CenteredHeaderProps = {
    title: string
    backButton?: boolean
    closeButton?: boolean
}

export const CenteredHeader: React.FC<CenteredHeaderProps> = ({
    title,
    backButton,
    closeButton,
}) => {
    return (
        <Header
            backButton={backButton}
            closeButton={closeButton}
            headerCenter={
                <Text bold numberOfLines={1} adjustsFontSizeToFit>
                    {title}
                </Text>
            }
        />
    )
}
