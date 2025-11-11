import * as RadixLabel from '@radix-ui/react-label'
import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import CopyIcon from '@fedi/common/assets/svgs/copy.svg'
import { useToast } from '@fedi/common/hooks/toast'

import { styled, theme } from '../styles'
import { Icon } from './Icon'
import { Text } from './Text'

interface Props {
    value: string
    onCopyMessage?: string
}

export const CopyInput: React.FC<Props> = ({ value, onCopyMessage }) => {
    const { t } = useTranslation()
    const toast = useToast()

    const handleCopy = useCallback(async () => {
        try {
            navigator.clipboard.writeText(value)
            if (onCopyMessage) {
                toast.show({
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    content: t(onCopyMessage as any),
                    status: 'success',
                })
            }
        } catch (err) {
            toast.error(t, err, 'errors.unknown-error')
        }
    }, [value, onCopyMessage, t, toast])

    return (
        <Container>
            <InputWrap>
                <TextInput value={value} />
                <CopyButton onClick={handleCopy}>
                    <Icon icon={CopyIcon} size={16} />
                    <Text variant="small" weight="medium">
                        {t('words.copy')}
                    </Text>
                </CopyButton>
            </InputWrap>
        </Container>
    )
}

const Container = styled(RadixLabel.Label, {
    width: '100%',
})

const InputWrap = styled('div', {
    alignItems: 'center',
    background: theme.colors.white,
    border: `1.5px solid ${theme.colors.black}`,
    borderRadius: 20,
    display: 'inline-flex',
    height: 48,
    position: 'relative',
    transition: 'border-color 80ms ease',
    overflow: 'hidden',
    width: '100%',
})

const TextInput = styled('input', {
    border: 'none',
    color: theme.colors.darkGrey,
    flex: 1,
    fontSize: 14,
    height: '100%',
    minWidth: 60,
    outline: 'none',
    padding: 12,
    textOverflow: 'ellipsis',
    userSelect: 'none',
})

const CopyButton = styled('button', {
    alignItems: 'center',
    display: 'flex',
    paddingRight: 12,
    gap: 4,

    '& svg': {
        flexShrink: 0,
    },
})
