import Link from 'next/link'
import { useRouter } from 'next/router'
import React, { useCallback } from 'react'

import PlusIcon from '@fedi/common/assets/svgs/plus.svg'
import ScanIcon from '@fedi/common/assets/svgs/scan.svg'
import { selectMatrixAuth } from '@fedi/common/redux'

import { settingsRoute } from '../constants/routes'
import { useAppSelector } from '../hooks'
import { styled, theme } from '../styles'
import { Icon } from './Icon'
import { ProfileIcon } from './ProfileIcon'

type Props = {
    onAddPress?: () => void
}

const MainHeaderButtons: React.FC<Props> = ({ onAddPress }) => {
    const router = useRouter()
    const matrixAuth = useAppSelector(selectMatrixAuth)

    const openOmniScanner = useCallback(() => {
        router.push('/scan')
    }, [router])

    return (
        <Container>
            {onAddPress && (
                <BubbleButton onClick={onAddPress}>
                    <Icon icon={PlusIcon} size="sm" />
                </BubbleButton>
            )}
            <Link href={settingsRoute}>
                <ProfileIcon url={matrixAuth?.avatarUrl} />
            </Link>
            <BubbleButton onClick={openOmniScanner}>
                <Icon icon={ScanIcon} size="sm" />
            </BubbleButton>
        </Container>
    )
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
})

const BubbleButton = styled('button', {
    height: 36,
    width: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.secondary,
    border: `1.5px solid ${theme.colors.lightGrey}`,
    borderRadius: '50%',
    cursor: 'pointer',
    transition: 'all 0.2s ease',

    '&:hover': {
        backgroundColor: theme.colors.offWhite100,
        borderColor: theme.colors.primary,
    },

    '&:focus': {
        outline: 'none',
        borderColor: theme.colors.primary,
    },
})

export default MainHeaderButtons
