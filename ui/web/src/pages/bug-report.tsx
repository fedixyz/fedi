import { useTranslation } from 'react-i18next'

import BugReport from '../components/BugReport'
import { ContentBlock } from '../components/ContentBlock'
import * as Layout from '../components/Layout'

export default function BugReportPage() {
    const { t } = useTranslation()

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Header back="/">
                    <Layout.Title subheader>
                        {t('feature.bug.report-a-bug')}
                    </Layout.Title>
                </Layout.Header>

                <Layout.Content>
                    <BugReport />
                </Layout.Content>
            </Layout.Root>
        </ContentBlock>
    )
}
