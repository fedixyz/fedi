import { useRouter } from 'next/router'
import React from 'react'

import ChevronLeftIcon from '@fedi/common/assets/svgs/chevron-left.svg'

import { IconButton } from '../components/IconButton'
import * as Layout from '../components/Layout'
import { styled } from '../styles'

const MOBILE_MAX_WIDTH = '600px'

const StyledHeader = styled(Layout.Header, {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 12,

    [`@media (max-width: ${MOBILE_MAX_WIDTH})`]: {
        position: 'relative',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
    },
})

const StyledBackButton = styled(IconButton, {
    [`@media (max-width: ${MOBILE_MAX_WIDTH})`]: {
        marginRight: 'auto',
    },
})

const StyledTitle = styled(Layout.Title, {
    [`@media (max-width: ${MOBILE_MAX_WIDTH})`]: {
        textAlign: 'center',
        /* Shift a touch left so visual centre ≃ true centre (chevron ≈ 24 px wide) */
        transform: 'translateX(-12px)',
    },
})

export interface BackHeaderProps {
    title: string
    subheader?: boolean
}

export const BackHeader: React.FC<BackHeaderProps> = ({
    title,
    subheader = false,
}) => {
    const router = useRouter()

    return (
        <StyledHeader>
            <StyledBackButton
                size="md"
                icon={ChevronLeftIcon}
                onClick={router.back}
            />
            <StyledTitle subheader={subheader}>{title}</StyledTitle>
        </StyledHeader>
    )
}
