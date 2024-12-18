import { Text } from '@rneui/themed'
import React from 'react'

import Header from './Header'

type CenteredHeaderProps = {
    title: string
    backButton?: boolean
}

export const CenteredHeader: React.FC<CenteredHeaderProps> = ({
    title,
    backButton,
}) => {
    return (
        <Header
            backButton={backButton}
            headerCenter={
                <Text bold numberOfLines={1} adjustsFontSizeToFit>
                    {title}
                </Text>
            }
        />
    )
}
