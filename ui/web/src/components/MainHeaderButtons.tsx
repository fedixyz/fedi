import Link from 'next/link'
import React from 'react'

import HamburgerIcon from '@fedi/common/assets/svgs/hamburger-icon.svg'
import PlusIcon from '@fedi/common/assets/svgs/plus.svg'
import SearchIcon from '@fedi/common/assets/svgs/search.svg'
import { selectMatrixAuth } from '@fedi/common/redux'

import { settingsRoute } from '../constants/routes'
import { useAppSelector } from '../hooks'
import { styled } from '../styles'
import { Row } from './Flex'
import { Icon } from './Icon'
import { ProfileIcon } from './ProfileIcon'

type Props = {
    onMenuPress?: () => void
    onAddPress?: () => void
    onSearchPress?: () => void
}

const MainHeaderButtons: React.FC<Props> = ({
    onMenuPress,
    onSearchPress,
    onAddPress,
}) => {
    const matrixAuth = useAppSelector(selectMatrixAuth)

    return (
        <Row gap="md" align="center">
            {onMenuPress && (
                <IconButton
                    onClick={onMenuPress}
                    data-testid="MainHeaderButtons__HamburgerIcon">
                    <Icon icon={HamburgerIcon} size="sm" />
                </IconButton>
            )}
            {onSearchPress && (
                <IconButton onClick={onSearchPress}>
                    <Icon icon={SearchIcon} size="sm" />
                </IconButton>
            )}
            {onAddPress && (
                <IconButton onClick={onAddPress}>
                    <Icon icon={PlusIcon} size="sm" />
                </IconButton>
            )}
            <Link href={settingsRoute}>
                <ProfileIcon url={matrixAuth?.avatarUrl} />
            </Link>
        </Row>
    )
}

export const IconButton = styled('button', {
    alignItems: 'center',
    cursor: 'pointer',
    display: 'flex',
    height: 24,
    justifyContent: 'center',
    width: 24,
})

export default MainHeaderButtons
