import * as RadixSwitch from '@radix-ui/react-switch'
import { styled } from '@stitches/react'
import React from 'react'

import { theme } from '@fedi/common/constants/theme'

type Props = RadixSwitch.SwitchProps

export const Switch: React.FC<Props> = ({ disabled = false, ...props }) => {
    return (
        <SwitchRoot disabled={disabled} {...props}>
            <SwitchThumb />
        </SwitchRoot>
    )
}

const SwitchRoot = styled(RadixSwitch.Root, {
    backgroundColor: theme.colors.lightGrey,
    flexShrink: 0,
    borderRadius: theme.sizes.xl,
    width: 42,
    height: theme.sizes.sm,
    position: 'relative',
    overflow: 'hidden',
    '-webkit-tab-highlight-color': 'transparent',
    transition: 'background-color 250ms',
    willChange: 'background-color',

    '&[data-state="checked"]': {
        backgroundColor: theme.colors.black,
    },

    variants: {
        disabled: {
            true: {
                opacity: 0.5,
                cursor: 'not-allowed',
            },
        },
    },
})

const SwitchThumb = styled(RadixSwitch.Thumb, {
    display: 'block',
    width: 20,
    height: 20,
    backgroundColor: theme.colors.white,
    borderRadius: theme.sizes.xl,
    transition: 'transform 250ms',
    transform: 'translateX(2px)',
    willChange: 'transform',
    boxShadow: `0 0 8px ${theme.colors.black}20`,

    '&[data-state="checked"]': {
        transform: 'translateX(20px)',
    },
})
