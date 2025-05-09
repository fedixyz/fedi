import { ImageSourcePropType } from 'react-native'

// TODO: Improve this typing, this allows people to access keys that haven't been defined.
interface ImagesMap {
    [key: string]: ImageSourcePropType
}

export const Images: ImagesMap = {
    FediLogo: require('./fedi-logo.png'),
    FediQrLogo: require('./fedi-qr-logo.png'),
    HoloBackground: require('./holo-background.jpg'),
    GradientBackground: require('./gradient-background.png'),
    HoloRing: require('./holo-ring.png'),
    HoloBackgroundStrong: require('./holo-background-strong-900.png'),
    IllustrationChat: require('@fedi/common/assets/images/illustration-chat.png'),
    IllustrationWorld: require('@fedi/common/assets/images/illustration-world.png'),
    IllustrationPin: require('@fedi/common/assets/images/illustration-pin.png'),
    FallbackInset: require('@fedi/common/assets/images/fallback-inset.png'),
    AwesomeFedimint: require('@fedi/common/assets/images/awesome-fedimint.png'),
    CommunityCreate: require('@fedi/common/assets/images/community-create-graphic.png'),
    WelcomeBackground: require('@fedi/common/assets/images/welcome-bg.png'),
    Red: require('@fedi/common/assets/images/red.png'),
}

export const FediModImages: ImagesMap = {
    'ai-beta': require('@fedi/common/assets/images/fedimods/ai-beta.png'),
    'bitcoinco': require('@fedi/common/assets/images/fedimods/bitcoinco.png'),
    'bitrefill': require('@fedi/common/assets/images/fedimods/bitrefill.png'),
    'btcmap': require('@fedi/common/assets/images/fedimods/btcmap.png'),
    'btcprague-program': require('@fedi/common/assets/images/fedimods/btcprague-program.png'),
    'btcprague-useful': require('@fedi/common/assets/images/fedimods/btcprague-useful.png'),
    'btcprague-speakers': require('@fedi/common/assets/images/fedimods/btcprague-speakers.png'),
    'btcprague-side-events': require('@fedi/common/assets/images/fedimods/btcprague-side-events.png'),
    'bug-report': require('@fedi/common/assets/images/fedimods/bug-report.png'),
    'default': require('@fedi/common/assets/images/fedimods/default.png'),
    'fedi-community': require('@fedi/common/assets/images/fedimods/fedi-community.png'),
    'fedifeedback': require('@fedi/common/assets/images/fedimods/fedifeedback.png'),
    'geyser': require('@fedi/common/assets/images/fedimods/geyser.png'),
    'hrf': require('@fedi/common/assets/images/fedimods/hrf.png'),
    'ibex': require('@fedi/common/assets/images/fedimods/ibex.png'),
    'kollider': require('@fedi/common/assets/images/fedimods/kollider.png'),
    'lookingglass': require('@fedi/common/assets/images/fedimods/lookingglass.png'),
    'mutinynet-faucet': require('@fedi/common/assets/images/fedimods/mutinynet-faucet.png'),
    'product-feedback': require('@fedi/common/assets/images/fedimods/product-feedback.png'),
    'satscard': require('@fedi/common/assets/images/fedimods/satscard.png'),
    'stackernews': require('@fedi/common/assets/images/fedimods/stackernews.png'),
    'stakwork': require('@fedi/common/assets/images/fedimods/stakwork.png'),
    'wavlake': require('@fedi/common/assets/images/fedimods/wavlake.png'),
    'support': require('@fedi/common/assets/images/fedimods/support.png'),
}
