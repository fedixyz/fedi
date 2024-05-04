// Load eruda remotely to avoid bundling it
document.addEventListener('DOMContentLoaded', () => {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/eruda'
    document.body.append(script)
    script.onload = function () {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(window as any).eruda.init()
    }
})

// Removed during compilation
export default ''
