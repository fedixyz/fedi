import React, { useCallback, useEffect, useState } from 'react'

import { Button } from '../../components/Button'
import { styled } from '../../styles'
import { Dialog } from '../Dialog'
import { DialogStatus, DialogStatusProps } from '../DialogStatus'
import { Input } from '../Input'
import { RadioGroup } from '../RadioGroup'

const sizes = ['sm', 'md', 'lg'] as const
type Size = (typeof sizes)[number]

const statusTypes = ['success', 'error'] as const
type StatusType = (typeof statusTypes)[number]

export const DialogDemo: React.FC = () => {
    const [open, setOpen] = useState(false)
    const [size, setSize] = useState<Size>('md')
    const [statusType, setStatusType] = useState<StatusType>('success')
    const [value1, setValue1] = useState('')
    const [value2, setValue2] = useState('')
    const [status, setStatus] = useState<DialogStatusProps['status']>()

    useEffect(() => {
        if (!open) {
            setValue1('')
            setValue2('')
            setStatus(undefined)
        }
    }, [open])

    const handleSubmit = useCallback(
        (ev: React.FormEvent) => {
            ev.preventDefault()
            setStatus('loading')
            setTimeout(() => {
                setStatus(statusType)
                setTimeout(() => {
                    setOpen(false)
                }, 2000)
            }, 2000)
        },
        [statusType],
    )

    return (
        <Container>
            <Controls>
                <div>
                    Size
                    <RadioGroup
                        options={sizes.map(s => ({ value: s, label: s }))}
                        value={size}
                        onChange={s => setSize(s as Size)}
                    />
                </div>
                <div>
                    Status
                    <RadioGroup
                        options={statusTypes.map(s => ({ value: s, label: s }))}
                        value={statusType}
                        onChange={s => setStatusType(s as StatusType)}
                    />
                </div>
            </Controls>
            <Button onClick={() => setOpen(true)}>Open a Dialog</Button>
            <Dialog
                title="Dialog title"
                description="This is a description for the dialog."
                size={size}
                open={open}
                onOpenChange={setOpen}>
                <Form onSubmit={handleSubmit}>
                    <Input
                        label="Field one"
                        value={value1}
                        onChange={ev => setValue1(ev.currentTarget.value)}
                    />

                    <Input
                        label="Field two"
                        value={value2}
                        onChange={ev => setValue2(ev.currentTarget.value)}
                    />
                    <Actions>
                        <Button type="submit">Save</Button>
                        <Button
                            type="submit"
                            variant="tertiary"
                            onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                    </Actions>
                </Form>
                {status && (
                    <DialogStatus
                        status={status}
                        title={`I am ${status}`}
                        description="This is a description"
                    />
                )}
            </Dialog>
        </Container>
    )
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    maxWidth: 320,
    gap: 10,
})

const Form = styled('form', {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
})

const Controls = styled('div', {
    display: 'flex',
    gap: 16,
})

const Actions = styled('div', {
    display: 'flex',
    gap: 8,
})
