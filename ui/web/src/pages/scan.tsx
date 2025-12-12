import { useTranslation } from 'react-i18next'

import { ContentBlock } from '../components/ContentBlock'
import * as Layout from '../components/Layout'
import { OmniInput } from '../components/OmniInput'
import { styled } from '../styles'

function ScanPage() {
    const { t } = useTranslation()

    return (
        <ContentBlock>
            <Layout.Header showCloseButton>
                <Layout.Title subheader>
                    {t('feature.omni.action-scan')}
                </Layout.Title>
            </Layout.Header>
            <Layout.Root>
                <Layout.Content centered fadeIn>
                    <Content>
                        <OmniInput
                            expectedInputTypes={[]}
                            onExpectedInput={() => {}}
                            onUnexpectedSuccess={() => {}}
                            customActions={['paste']}
                        />
                    </Content>
                </Layout.Content>
            </Layout.Root>
        </ContentBlock>
    )
}

const Content = styled('div', {
    boxSizing: 'border-box',
    display: 'flex',
    flex: 1,
    minHeight: 500,
    padding: '20px 0',
    textAlign: 'center',
})

export default ScanPage
