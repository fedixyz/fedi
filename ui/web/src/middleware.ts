import { NextRequest, NextResponse } from 'next/server'

/**
 * Adds Content-Security-Policy headers to the response. Roughly implemented
 * following NextJS docs best practices, with some modifications for Fedi-specifics.
 * https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy
 */
export function middleware(req: NextRequest) {
    const isDev = process.env.NODE_ENV !== 'production'
    const cspHeaders = [
        // Unlesss otherwise specified, only allow same origin.
        `default-src 'self'`,
        // Allow scripts and styles from the same origin, and from inline script tags.
        // Development mode needs eval for hot module reloading.
        `script-src 'self' 'unsafe-inline' ${isDev ? `'unsafe-eval'` : ''}`,
        `style-src 'self' 'unsafe-inline'`,
        // Allow worker scripts to also use blob: URIs. qr-scanner currently needs
        // this, would be nice to remove if we can extract its worker to a separate file.
        // https://github.com/nimiq/qr-scanner/issues/221
        `worker-src 'self' 'unsafe-inline' blob:`,
        // Allow fetch requsts and WebSockets to any URL. This is due to dynamic federation
        // meta, so we need to be able to interact with any URLs configured at runtime.
        'connect-src *',
        // Allow images, audio, and video from anywhere due to user avatars,
        // federation icons, recovery videos, etc. etc. Also allow for media we
        // construct in JS with blob: and data: URIs.
        `img-src * blob: data:`,
        'media-src * blob: data:',
        // Allow iframe tags for displaying ToS
        `frame-src *`,
        // Completely disable <object>, <embed>, and <base> tags.
        `object-src 'none'`,
        `base-uri 'none'`,
        // Completely disable the site being iframed.
        `frame-ancestors 'none'`,
    ]
    const cspHeader = cspHeaders.join('; ')

    const requestHeaders = new Headers(req.headers)
    requestHeaders.set('Content-Security-Policy', cspHeader)

    const response = NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    })
    response.headers.set('Content-Security-Policy', cspHeader)

    return response
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        {
            source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
            missing: [
                { type: 'header', key: 'next-router-prefetch' },
                { type: 'header', key: 'purpose', value: 'prefetch' },
            ],
        },
    ],
}
