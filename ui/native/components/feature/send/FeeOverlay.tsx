import { useTheme } from '@rneui/themed'
import React from 'react'

import { FeeItem } from '@fedi/common/hooks/transactions'

import CenterOverlay from '../../ui/CenterOverlay'
import SvgImage from '../../ui/SvgImage'
import { FeeBreakdown } from './FeeBreakdown'

type FeeOverlayProps = {
    onDismiss: () => void
    show?: boolean
    title: string
    feeItems: FeeItem[]
    description?: string | React.ReactNode
    icon?: React.ReactNode
}

const FeeOverlay: React.FC<FeeOverlayProps> = ({
    title,
    show = false,
    onDismiss,
    feeItems,
    description,
    icon,
}) => {
    const { theme } = useTheme()

    return (
        <CenterOverlay show={show} onBackdropPress={onDismiss}>
            <FeeBreakdown
                title={title}
                icon={
                    icon ?? (
                        <SvgImage
                            name="Info"
                            size={32}
                            color={theme.colors.blue}
                        />
                    )
                }
                feeItems={feeItems.map(
                    ({ label, formattedAmount }: FeeItem) => ({
                        label: label,
                        value: formattedAmount,
                    }),
                )}
                onClose={onDismiss}
                guidanceText={description}
            />
        </CenterOverlay>
    )
}

export default FeeOverlay
