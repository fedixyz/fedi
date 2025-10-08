import { useRouter } from 'next/router'
import { useTranslation } from 'react-i18next'

import { ParserDataType } from '@fedi/common/types'

import { ContentBlock } from '../components/ContentBlock'
import * as Layout from '../components/Layout'
import { OmniInput } from '../components/OmniInput'
import { styled } from '../styles'

function ScanPage() {
    const { t } = useTranslation()
    const { push } = useRouter()

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
                            expectedInputTypes={[
                                ParserDataType.FedimintInvite,
                                ParserDataType.CommunityInvite,
                            ]}
                            onExpectedInput={({ data }) =>
                                push(
                                    `/onboarding/join?invite_code=${data.invite}`,
                                )
                            }
                            onUnexpectedSuccess={() => null}
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
