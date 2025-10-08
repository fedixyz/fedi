export type FediGradientVariant =
    | 'black'
    | 'black-50'
    | 'white'
    | 'white-50'
    | 'sky'
    | 'sky-banner'
    | 'sky-heavy'

/**
 * Generates the SVG XML code for a gradient defined in the design system
 *
 * See
 * - https://www.figma.com/design/tofJj4TxL6U4OtDC2D9KUg/Fedi-Design---Design-System?node-id=4008-2546&t=F5UHLCDWBzluS2ou-4
 */

export const makeFediGradient = ({
    width,
    height,
    variant,
}: {
    width?: number
    height?: number
    variant: FediGradientVariant
}) => {
    let contents: string

    switch (variant) {
        case 'black':
            contents = `
<rect width="350" height="120" fill="#0B1013"/>
<rect width="350" height="120" fill="url(#paint0_linear_4009_32803)" fill-opacity="0.2"/>
<defs>
    <linearGradient id="paint0_linear_4009_32803" x1="175" y1="-36.25" x2="175" y2="120" gradientUnits="userSpaceOnUse">
        <stop stop-color="white"/>
        <stop offset="1" stop-color="white" stop-opacity="0.04"/>
    </linearGradient>
</defs>`
            break
        case 'black-50':
            contents = `
<rect width="350" height="120" fill="#0B1013" fill-opacity="0.5"/>
<rect width="350" height="120" fill="url(#paint0_linear_4009_32808)" fill-opacity="0.2"/>
<defs>
    <linearGradient id="paint0_linear_4009_32808" x1="175" y1="-36.25" x2="175" y2="120" gradientUnits="userSpaceOnUse">
        <stop stop-color="white"/>
        <stop offset="1" stop-color="white" stop-opacity="0.04"/>
    </linearGradient>
</defs>`
            break
        case 'white':
            contents = `
<rect width="350" height="120" fill="white"/>
<rect width="350" height="120" fill="url(#paint0_linear_4240_39940)" fill-opacity="0.14"/>
<defs>
    <linearGradient id="paint0_linear_4240_39940" x1="66.7939" y1="143.75" x2="66.7939" y2="0" gradientUnits="userSpaceOnUse">
        <stop stop-color="#0B1013"/>
        <stop offset="1" stop-color="white" stop-opacity="0.04"/>
    </linearGradient>
</defs>`
            break
        case 'white-50':
            contents = `
<rect width="350" height="120" fill="white" fill-opacity="0.5"/>
<rect width="350" height="120" fill="url(#paint0_linear_4240_39941)" fill-opacity="0.14"/>
<defs>
    <linearGradient id="paint0_linear_4009_33058" x1="66.7939" y1="143.75" x2="66.7939" y2="0" gradientUnits="userSpaceOnUse">
        <stop stop-color="#0B1013"/>
        <stop offset="1" stop-color="white" stop-opacity="0"/>
    </linearGradient>
</defs>`
            break
        case 'sky-banner':
            contents = `
<rect width="350" height="120" fill="#D3D4DB"/>
<rect width="350" height="120" fill="url(#paint0_radial_4232_39591)"/>
<rect width="350" height="120" fill="url(#paint1_radial_4232_39591)"/>
<defs>
    <radialGradient id="paint0_radial_4232_39591" cx="0" cy="0" r="1" gradientTransform="matrix(458.538 142.353 -289.724 353.12 -5.73771 80.2941)" gradientUnits="userSpaceOnUse">
        <stop stop-color="#FFF9DE"/>
        <stop offset="1" stop-color="white" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="paint1_radial_4232_39591" cx="0" cy="0" r="1" gradientTransform="matrix(-47.8142 152.353 -257.651 -30.5962 279.713 -5.58825)" gradientUnits="userSpaceOnUse">
        <stop stop-color="#B6EAFF"/>
        <stop offset="1" stop-color="white" stop-opacity="0.04"/>
    </radialGradient>
</defs>
`
            break
        case 'sky':
            contents = `
<rect width="350" height="120" fill="#D2E7F6"/>
<rect width="350" height="120" fill="url(#paint0_radial_13880_22551)"/>
<rect width="350" height="120" fill="url(#paint1_radial_13880_22551)"/>
<defs>
    <radialGradient id="paint0_radial_13880_22551" cx="0" cy="0" r="1" gradientTransform="matrix(244.079 77.8173 -226.967 94.1898 63.6364 27.1066)" gradientUnits="userSpaceOnUse">
        <stop stop-color="#F9EFD2"/>
        <stop offset="1" stop-color="#F9EFD2" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="paint1_radial_13880_22551" cx="0" cy="0" r="1" gradientTransform="matrix(-218.122 70.6599 -206.091 -84.173 323.624 13.7056)" gradientUnits="userSpaceOnUse">
        <stop stop-color="#FDE7D7"/>
        <stop offset="1" stop-color="#FDE9DA" stop-opacity="0"/>
    </radialGradient>
</defs>`
            break
        case 'sky-heavy':
            contents = `
<rect width="350" height="120" fill="white"/>
<rect width="350" height="120" fill="url(#paint0_radial_4232_39595)"/>
<rect width="350" height="120" fill="url(#paint1_radial_4232_39595)"/>
<defs>
    <radialGradient id="paint0_radial_4232_39595" cx="0" cy="0" r="1" gradientTransform="matrix(319.399 84.4118 -171.799 245.969 -5.7377 122.353)" gradientUnits="userSpaceOnUse">
        <stop stop-color="#07C9CF"/>
        <stop offset="1" stop-color="white" stop-opacity="0.04"/>
    </radialGradient>
    <radialGradient id="paint1_radial_4232_39595" cx="0" cy="0" r="1" gradientTransform="matrix(-91.8033 236.176 -399.409 -58.7446 282.582 -44.7059)" gradientUnits="userSpaceOnUse">
        <stop stop-color="#df7b00"/>
        <stop offset="1" stop-color="white" stop-opacity="0.04"/>
    </radialGradient>
</defs>`
            break
    }

    return `<svg
        ${width ? `width="${width}"` : ''}
        ${height ? `height="${height}"` : ''}
        viewBox="0 0 350 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none">
            ${contents}
    </svg>`
}
