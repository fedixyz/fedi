import { useRouter } from 'next/router'
import { useTranslation } from 'react-i18next'

import { ContentBlock } from '../../components/ContentBlock'
import Success from '../../components/Success'

const GuardianFeesSuccessPage: React.FC = () => {
    const { t } = useTranslation()
    const router = useRouter()

    return (
        <ContentBlock>
            <Success
                title={t('feature.guardian-fees.transfer-success')}
                buttonText={t('words.done')}
                onClick={() => router.back()}
            />
        </ContentBlock>
    )
}

export default GuardianFeesSuccessPage
