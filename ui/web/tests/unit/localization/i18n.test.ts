import { getSupportedBrowserLanguage } from '../../../src/localization/i18n'

describe('/localization/i18n', () => {
    it('should use exact supported language matches', () => {
        expect(getSupportedBrowserLanguage(['es'])).toBe('es')
    })

    it('should use the supported base language for regional locales', () => {
        expect(getSupportedBrowserLanguage(['es-MX'])).toBe('es')
        expect(getSupportedBrowserLanguage(['es_MX'])).toBe('es')
    })

    it('should use the first supported language from browser preferences', () => {
        expect(getSupportedBrowserLanguage(['zz-ZZ', 'fr-CA'])).toBe('fr')
    })

    it('should fall back to English when no browser preferences are supported', () => {
        expect(getSupportedBrowserLanguage([])).toBe('en')
        expect(getSupportedBrowserLanguage(['zz-ZZ'])).toBe('en')
    })
})
