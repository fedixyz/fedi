import React from 'react'

import { ContentBlock } from '../../../components/ContentBlock'
import { SocialBackup } from '../../../components/SocialBackup'

// Social backup state is all in-memory, so a single route covers the full flow.
function SocialBackupPage() {
    return (
        <ContentBlock>
            <SocialBackup />
        </ContentBlock>
    )
}

export default SocialBackupPage
