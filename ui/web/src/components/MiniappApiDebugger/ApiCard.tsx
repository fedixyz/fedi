import React from 'react'

import { styled, theme } from '../../styles'
import { ApiDef, Custom, LogEntry } from './apis'

export const ApiCard: React.FC<{
    api: ApiDef
    custom: Custom
    onCustomChange: (key: string, value: string) => void
    onCall: (api: ApiDef, variantIdx: number) => void
    last: LogEntry | undefined
}> = ({ api, custom, onCustomChange, onCall, last }) => (
    <Card>
        <ApiName>{api.type}</ApiName>
        {api.inputs && (
            <InputGroup>
                {api.inputs.map(f => (
                    <InputRow key={f.key}>
                        <InputLabel>{f.label}</InputLabel>
                        {f.multiline ? (
                            <TextArea
                                value={custom[f.key] || ''}
                                onChange={e =>
                                    onCustomChange(f.key, e.target.value)
                                }
                                placeholder={f.placeholder}
                                rows={2}
                            />
                        ) : (
                            <Input
                                value={custom[f.key] || ''}
                                onChange={e =>
                                    onCustomChange(f.key, e.target.value)
                                }
                                placeholder={f.placeholder}
                            />
                        )}
                    </InputRow>
                ))}
            </InputGroup>
        )}
        <VariantRow>
            {api.variants.map((v, i) => (
                <VariantButton key={v.label} onClick={() => onCall(api, i)}>
                    {v.label}
                </VariantButton>
            ))}
        </VariantRow>
        {last && last.status !== 'pending' && (
            <ResultBlock status={last.status}>
                <pre>
                    {last.status === 'success'
                        ? JSON.stringify(last.response, null, 2)
                        : last.error}
                </pre>
            </ResultBlock>
        )}
    </Card>
)

const Card = styled('div', {
    border: `1px solid ${theme.colors.extraLightGrey}`,
    borderRadius: 8,
    padding: 12,
    background: theme.colors.white,
})
const ApiName = styled('div', {
    fontFamily: theme.fonts.mono,
    fontSize: 13,
    fontWeight: 600,
    color: theme.colors.darkGrey,
    marginBottom: 6,
})

const InputGroup = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginBottom: 8,
})
const InputRow = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
})
const InputLabel = styled('label', {
    fontSize: 11,
    fontWeight: 500,
    color: theme.colors.grey,
})
const Input = styled('input', {
    fontSize: 13,
    padding: '6px 8px',
    border: `1px solid ${theme.colors.lightGrey}`,
    borderRadius: 6,
    fontFamily: theme.fonts.mono,
    outline: 'none',
    '&:focus': { borderColor: theme.colors.primary },
})
const TextArea = styled('textarea', {
    fontSize: 13,
    padding: '6px 8px',
    border: `1px solid ${theme.colors.lightGrey}`,
    borderRadius: 6,
    fontFamily: theme.fonts.mono,
    resize: 'vertical',
    outline: 'none',
    '&:focus': { borderColor: theme.colors.primary },
})

const VariantRow = styled('div', { display: 'flex', gap: 6, flexWrap: 'wrap' })
const VariantButton = styled('button', {
    fontSize: 12,
    fontWeight: 500,
    padding: '6px 12px',
    borderRadius: 6,
    border: 'none',
    background: theme.colors.primary,
    color: theme.colors.white,
    cursor: 'pointer',
    '&:hover': { opacity: 0.85 },
    '&:active': { opacity: 0.7 },
})

const ResultBlock = styled('div', {
    marginTop: 8,
    borderRadius: 6,
    padding: '8px 10px',
    fontSize: 12,
    fontFamily: theme.fonts.mono,
    overflowX: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    '& pre': { margin: 0 },
    variants: {
        status: {
            success: {
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                color: '#166534',
            },
            error: {
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
            },
            pending: {
                background: theme.colors.grey50,
                border: `1px solid ${theme.colors.lightGrey}`,
            },
        },
    },
})
