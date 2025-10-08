import { SvgXml } from 'react-native-svg'

import {
    FediGradientVariant,
    makeFediGradient,
} from '@fedi/common/utils/gradients'

/**
 * Renders an SVG gradient with the given variant
 */
export function SvgGradient({
    variant,
    ...props
}: { variant: FediGradientVariant } & Omit<
    React.ComponentProps<typeof SvgXml>,
    'xml'
>) {
    return <SvgXml xml={makeFediGradient({ variant })} {...props} />
}
