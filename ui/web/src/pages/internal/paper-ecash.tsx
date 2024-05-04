import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '@fedi/common/hooks/toast'
import { selectActiveFederation } from '@fedi/common/redux'
import { MSats } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { makeLog } from '@fedi/common/utils/log'

import { Button } from '../../components/Button'
import { ContentBlock } from '../../components/ContentBlock'
import { PaperEcashForm } from '../../components/PaperEcash/PaperEcashForm'
import { PaperEcashPaper } from '../../components/PaperEcash/PaperEcashPaper'
import { Text } from '../../components/Text'
import { useAppSelector } from '../../hooks'
import { fedimint } from '../../lib/bridge'
import { styled } from '../../styles'

const log = makeLog('PaperEcash')

export interface EcashPaper {
    frames: string[]
    ecash: string
    amount: MSats
}

const PaperEcash: React.FC = () => {
    const toast = useToast()
    const activeFederation = useAppSelector(selectActiveFederation)

    const { t } = useTranslation()

    const [ecashPapers, setEcashPapers] = useState<EcashPaper[]>([])
    const [isCanceling, setIsCanceling] = useState(false)
    const [hasPrinted, setHasPrinted] = useState(false)

    const handlePrint = () => {
        const printElement = document.getElementById('print-element')
        if (!printElement) return

        // First get all the elements that are in the tree of our print element
        const excludedEls: Element[] = [printElement]
        const excludeParents = (el: Element) => {
            if (el === document.body) return
            if (el.parentElement) {
                excludedEls.push(el.parentElement)
                excludeParents(el.parentElement)
            }
        }
        const excludeChildren = (el: Element) => {
            for (const child of Array.from(el.children)) {
                excludedEls.push(child)
                excludeChildren(child)
            }
        }
        excludeParents(printElement)
        excludeChildren(printElement)

        // Now apply display: none to all elements that are not excluded
        const allEls = document.body.querySelectorAll('*')
        const styledEls: HTMLElement[] = []
        allEls.forEach(el => {
            if (excludedEls.includes(el as HTMLElement)) return
            if ('style' in el) {
                ;(el as HTMLElement).style.display = 'none'
                styledEls.push(el as HTMLElement)
            }
        })

        // Print the page, blocking until they print or cancel
        const count = ecashPapers.length
        const amount = amountUtils.formatSats(
            amountUtils.msatToSat(ecashPapers[0]?.amount),
        )
        const oldTitle = document.title
        document.title = `${activeFederation?.name} ecash - ${amount} SATS - ${count} papers`
        window.print()
        setHasPrinted(true)
        document.title = oldTitle

        // Undo the display: nones
        styledEls.forEach(el => {
            el.style.display = ''
        })
    }

    const handleStartOver = () => {
        setEcashPapers([])
        setHasPrinted(false)
    }

    const handleCancel = async () => {
        setIsCanceling(true)
        try {
            if (!activeFederation) throw new Error('No active federation')
            for (const paper of ecashPapers) {
                log.info('Canceling paper ecash', paper.ecash)
                await fedimint.cancelEcash(paper.ecash, activeFederation.id)
                setEcashPapers(prev =>
                    prev.filter(p => p.ecash !== paper.ecash),
                )
                // Delay 500ms between to avoid locking up
                await new Promise(resolve => setTimeout(resolve, 500))
            }
            setEcashPapers([])
        } catch (err) {
            log.error('Failed to cancel', err)
            toast.error(t, err, 'Failed to cancel, check logs')
        }
        setIsCanceling(false)
        setHasPrinted(false)
    }

    return (
        <>
            {!ecashPapers.length && (
                <ContentBlock>
                    <Text variant="h2">Paper ecash</Text>
                    <PaperEcashForm onChangeEcashPapers={setEcashPapers} />
                </ContentBlock>
            )}
            {!!ecashPapers.length && (
                <ContentBlock>
                    <Text variant="h2" css={{ marginBottom: 16 }}>
                        Success! Ecash generated
                    </Text>
                    <Button width="full" onClick={handlePrint}>
                        Click here to print
                    </Button>
                    {hasPrinted && (
                        <Button
                            width="full"
                            variant="outline"
                            onClick={handleStartOver}
                            css={{ marginTop: 12 }}>
                            Click here to start over
                        </Button>
                    )}
                    <Text
                        variant="small"
                        css={{ padding: 16, textAlign: 'center' }}>
                        or, if you did not like your results
                    </Text>
                    <Button
                        onClick={handleCancel}
                        width="full"
                        variant="outline"
                        loading={isCanceling}>
                        ⚠️ Cancel ecash notes and start over ⚠️
                    </Button>
                </ContentBlock>
            )}
            {ecashPapers.length > 0 && (
                <PrintElement id="print-element">
                    {ecashPapers.map(paper => (
                        <PaperEcashPaper key={paper.ecash} {...paper} />
                    ))}
                </PrintElement>
            )}
        </>
    )
}

const PrintElement = styled('div', {
    display: 'none',
    overflow: 'visible',

    '@media print': {
        display: 'block',
    },
})

export default PaperEcash
