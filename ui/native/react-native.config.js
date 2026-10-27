module.exports = {
    project: {
        ios: {
            // pods are managed by scripts/ui/install-ios-deps.sh; the cli's
            // auto-install runs `bundle exec pod install` against a Gemfile it
            // expects at ui/native/, which this repo keeps in ios/ instead
            automaticPodsInstallation: false,
        },
        android: {},
    },
    assets: ['./assets/fonts/'],
}
