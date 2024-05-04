import {
    CheckBox as CheckBoxRNE,
    CheckBoxProps as CheckBoxRNEProps,
} from '@rneui/themed'
import React from 'react'

import SvgImage from './SvgImage'

type CheckBoxProps = Omit<CheckBoxRNEProps, 'children'>

const CheckBox: React.FC<CheckBoxProps> = ({
    checkedIcon = <SvgImage name="CheckboxChecked" />,
    uncheckedIcon = <SvgImage name="CheckboxUnchecked" />,
    ...props
}: CheckBoxProps) => {
    return (
        <CheckBoxRNE
            checkedIcon={checkedIcon}
            uncheckedIcon={uncheckedIcon}
            {...props}
        />
    )
}

export default CheckBox
