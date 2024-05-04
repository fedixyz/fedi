// Comment me out if you want Workbox logging
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(self as any).__WB_DISABLE_DEV_LOGS = true

self.addEventListener('message', ev => {
    // eslint-disable-next-line no-console
    console.info('I got a message', ev)
})
