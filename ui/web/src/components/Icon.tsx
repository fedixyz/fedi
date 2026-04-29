import React from 'react'

import { theme as fediTheme } from '@fedi/common/constants/theme'

export type IconSize = keyof Pick<
    typeof fediTheme.sizes,
    'xxs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl'
>
interface BaseProps {
    icon: React.FunctionComponent<React.SVGAttributes<SVGElement>>
    size?: IconSize | number
}

export type IconProps = BaseProps &
    Omit<React.SVGAttributes<SVGElement>, keyof BaseProps>

export const Icon: React.FC<IconProps> = ({
    icon: SvgIcon,
    size = 'sm',
    style,
    ...props
}) => {
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
