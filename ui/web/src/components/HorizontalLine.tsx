import React from 'react'

import { styled, theme } from '../styles'
import { Text } from './Text'

export interface Props {
    text: string
}

export const HorizontalLine: React.FC<Props> = ({ text }) => {
    return (
        <Line>
            <LineText>{text}</LineText>
        </Line>
    )
}

const Line = styled(Text, {
    color: theme.colors.grey,
    fontSize: 14,
    overflow: 'hidden',
    textAlign: 'center',

    '&::before,&::after': {
        backgroundColor: theme.colors.extraLightGrey,
        content: '',
        display: 'inline-block',
        height: '1px',
        position: 'relative',
        verticalAlign: 'middle',
        width: '50%',
    },

    '&::before': {
        marginLeft: '-50%',
        right: 10,
    },

    '&::after': {
        left: 10,
        marginRight: '-50%',
    },
})

const LineText = styled('span', {
    textTransform: 'lowercase',
})
