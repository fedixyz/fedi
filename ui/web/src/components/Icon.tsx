import React from 'react'

import * as Svgs from '@fedi/common/assets/svgs'
import { theme as fediTheme } from '@fedi/common/constants/theme'

export type SvgIconName = keyof typeof Svgs
export type IconSize = keyof Pick<
    typeof fediTheme.sizes,
    'xxs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl'
>
interface BaseProps {
    icon: SvgIconName
    size?: IconSize | number
}

export type IconProps = BaseProps &
    Omit<React.SVGAttributes<SVGElement>, keyof BaseProps>

export const Icon: React.FC<IconProps> = ({
    icon,
    size = 'sm',
    style,
    ...props
}) => {
    const SvgIcon = Svgs[icon]

    const dimensions =
        typeof size === 'number'
            ? { width: size, height: size }
            : {
                  width: fediTheme.sizes[size],
                  height: fediTheme.sizes[size],
              }

    return (
        <SvgIcon
            style={{
                display: 'inline-block',
                ...dimensions,
                ...style,
            }}
            {...props}
        />
    )
}
