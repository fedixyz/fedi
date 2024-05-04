import React, { useState } from 'react'

import { Checkbox } from '../../components/Checkbox'
import { CheckboxGroup } from '../../components/CheckboxGroup'
import { Input } from '../../components/Input'
import { RadioGroup } from '../../components/RadioGroup'
import { Text } from '../../components/Text'
import { styled } from '../../styles'

export const FormDemo: React.FC = () => {
    const [oneChecked, setOneChecked] = useState(false)
    const [twoChecked, setTwoChecked] = useState(true)

    const [checkboxGroupValues, setCheckboxGroupValues] = useState(['one'])
    const [radioGroupValue, setRadioGroupValue] = useState('one')

    const [inputOneValue, setInputOneValue] = useState('')

    const groupOptions = [
        {
            label: 'Group option one',
            value: 'one',
        },
        {
            label: 'Group option two',
            value: 'two',
        },
        {
            label: 'Group option three',
            value: 'three',
            disabled: true,
        },
    ]

    return (
        <Container>
            <FormGroup>
                <Text variant="h2">Solo checkboxes</Text>
                <FormGroup>
                    <Checkbox
                        checked={oneChecked}
                        onChange={setOneChecked}
                        label="Default unchecked"
                    />
                    <Checkbox
                        checked={twoChecked}
                        onChange={setTwoChecked}
                        defaultChecked
                        label="Default checked"
                    />
                    <Checkbox
                        checked={true}
                        label="Disabled checked"
                        disabled
                    />
                    <Checkbox
                        checked={false}
                        label="Disabled unchecked"
                        disabled
                    />
                </FormGroup>
            </FormGroup>
            <FormGroup>
                <Text variant="h2">Checkbox group</Text>
                <CheckboxGroup
                    options={groupOptions}
                    values={checkboxGroupValues}
                    onChange={setCheckboxGroupValues}
                />
            </FormGroup>
            <FormGroup>
                <Text variant="h2">Radio group</Text>
                <RadioGroup
                    options={groupOptions}
                    value={radioGroupValue}
                    onChange={setRadioGroupValue}
                />
            </FormGroup>
            <FormGroup>
                <Text variant="h2">Inputs</Text>
                <FormGroup>
                    <Input
                        label="Default input"
                        value={inputOneValue}
                        onChange={ev =>
                            setInputOneValue(ev.currentTarget.value)
                        }
                        placeholder="Placeholder text"
                    />
                    <Input
                        label="Disabled input"
                        value=""
                        placeholder="Placeholder text"
                        disabled
                    />
                </FormGroup>
            </FormGroup>
        </Container>
    )
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
})

const FormGroup = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
})
