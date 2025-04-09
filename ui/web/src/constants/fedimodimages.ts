import { StaticImageData } from 'next/image'

import aiBetaImage from '@fedi/common/assets/images/fedimods/ai-beta.png'
import bitcoincoImage from '@fedi/common/assets/images/fedimods/bitcoinco.png'
import bitrefillImage from '@fedi/common/assets/images/fedimods/bitrefill.png'
import btcmapImage from '@fedi/common/assets/images/fedimods/btcmap.png'
import btcpragueProgramImage from '@fedi/common/assets/images/fedimods/btcprague-program.png'
import btcpragueSideEventsImage from '@fedi/common/assets/images/fedimods/btcprague-side-events.png'
import btcpragueSpeakersImage from '@fedi/common/assets/images/fedimods/btcprague-speakers.png'
import btcpragueUsefulImage from '@fedi/common/assets/images/fedimods/btcprague-useful.png'
import bugReportImage from '@fedi/common/assets/images/fedimods/bug-report.png'
import fediCommunityImage from '@fedi/common/assets/images/fedimods/fedi-community.png'
import fedifeedbackImage from '@fedi/common/assets/images/fedimods/fedifeedback.png'
import geyserImage from '@fedi/common/assets/images/fedimods/geyser.png'
import hrfImage from '@fedi/common/assets/images/fedimods/hrf.png'
import ibexImage from '@fedi/common/assets/images/fedimods/ibex.png'
import kolliderImage from '@fedi/common/assets/images/fedimods/kollider.png'
import lookingglassImage from '@fedi/common/assets/images/fedimods/lookingglass.png'
import mutinynetFaucetImage from '@fedi/common/assets/images/fedimods/mutinynet-faucet.png'
import productFeedbackImage from '@fedi/common/assets/images/fedimods/product-feedback.png'
import satscardImage from '@fedi/common/assets/images/fedimods/satscard.png'
import stackernewsImage from '@fedi/common/assets/images/fedimods/stackernews.png'
import stakworkImage from '@fedi/common/assets/images/fedimods/stakwork.png'
import wavlakeImage from '@fedi/common/assets/images/fedimods/wavlake.png'

export const FEDIMOD_IMAGES: Record<string, StaticImageData> = {
    'ai-beta': aiBetaImage,
    bitcoinco: bitcoincoImage,
    bitrefill: bitrefillImage,
    btcmap: btcmapImage,
    'btcprague-program': btcpragueProgramImage,
    'btcprague-useful': btcpragueUsefulImage,
    'btcprague-speakers': btcpragueSpeakersImage,
    'btcprague-side-events': btcpragueSideEventsImage,
    'bug-report': bugReportImage,
    'fedi-community': fediCommunityImage,
    fedifeedback: fedifeedbackImage,
    geyser: geyserImage,
    hrf: hrfImage,
    ibex: ibexImage,
    kollider: kolliderImage,
    lookingglass: lookingglassImage,
    'mutinynet-faucet': mutinynetFaucetImage,
    'product-feedback': productFeedbackImage,
    satscard: satscardImage,
    stackernews: stackernewsImage,
    stakwork: stakworkImage,
    wavlake: wavlakeImage,
}
