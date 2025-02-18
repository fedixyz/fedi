module.exports = async ({ github, context, core }) => {
    const {
        PUBLIC_APK_URL,
        PUBLIC_FEDI_ORG,
        PUBLIC_FEDI_REPO,
        NEW_VERSION,
        NEW_APK_FILENAME,
    } = process.env;

    const version = NEW_VERSION;
    const filename = NEW_APK_FILENAME;

    const newTagName = `v${version}`;
    // Drop patch version number for title
    const newTitle = `Fedi v${version.split('.').slice(0, 2).join('.')} - APK Download`;
    const newDescription = `Download & install Fedi <br><br> Download: [${filename}](${PUBLIC_APK_URL})`;

    // Check if a release with the same title exists in the target repo
    const { data: releases } = await github.rest.repos.listReleases({
        owner: PUBLIC_FEDI_ORG,
        repo: PUBLIC_FEDI_REPO,
    });

    const existingRelease = releases.find((release) => release.name === newTitle);

    if (existingRelease) {
        console.log('Existing release found, updating description & version...');
        await github.rest.repos.updateRelease({
            owner: PUBLIC_FEDI_ORG,
            repo: PUBLIC_FEDI_REPO,
            release_id: existingRelease.id,
            tag_name: newTagName,
            name: newTitle,
            body: newDescription,
        });
        console.log('Existing release updated with new APK version.');
    } else {
            console.log('No existing release found, creating a new one.');
        await github.rest.repos.createRelease({
            owner: PUBLIC_FEDI_ORG,
            repo: PUBLIC_FEDI_REPO,
            tag_name: newTagName,
            name: newTitle,
            body: newDescription,
        });
        console.log('New release created with latest APK version.');
    }
}; 