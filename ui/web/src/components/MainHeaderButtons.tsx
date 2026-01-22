import Link from 'next/link'
import React, { useState } from 'react'

import HamburgerIcon from '@fedi/common/assets/svgs/hamburger-icon.svg'
import PlusIcon from '@fedi/common/assets/svgs/plus.svg'
import ScanIcon from '@fedi/common/assets/svgs/scan.svg'
import { selectMatrixAuth } from '@fedi/common/redux'

import { settingsRoute } from '../constants/routes'
import { useAppSelector } from '../hooks'
import { styled } from '../styles'
import { Row } from './Flex'
import { Icon } from './Icon'
import { ProfileIcon } from './ProfileIcon'
import { ScanDialog } from './ScanDialog'

type Props = {
    onShowCommunitiesPress?: () => void
    onAddPress?: () => void
}

const MainHeaderButtons: React.FC<Props> = ({
    onShowCommunitiesPress,
    onAddPress,
}) => {
    const matrixAuth = useAppSelector(selectMatrixAuth)
    const [open, setOpen] = useState(false)

    return (
        <>
            <Row gap="md" align="center">
                {onShowCommunitiesPress && (
                    <IconButton onClick={onShowCommunitiesPress}>
                        <Icon icon={HamburgerIcon} size="sm" />
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
                <IconButton onClick={() => setOpen(true)}>
                    <Icon icon={ScanIcon} size="sm" />
                </IconButton>
            </Row>

            <ScanDialog open={open} onOpenChange={setOpen} />
        </>
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
