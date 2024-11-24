const fs = require('fs');
module.exports = async ({ github, context, core }) => {
    const { RELEASE_ID, SOURCE_FEDI_ORG, SOURCE_FEDI_REPO } = process.env;

    console.log('Starting APK preparation process.');

    // Fetch release assets from the source repo
    console.log(`Fetching release assets from the source repository`);
    const { data: assets } = await github.rest.repos.listReleaseAssets({
        owner: SOURCE_FEDI_ORG,
        repo: SOURCE_FEDI_REPO,
        release_id: RELEASE_ID,
    });

    // Find the APK file
    const apkAsset = assets.find((asset) => asset.name.endsWith('.apk'));
    if (!apkAsset) {
        throw new Error('APK file not found');
    }
    console.log(`APK file found: ${apkAsset.name}`);

    // Extract version and commit hash
    const regex = /app-production-release-(\d+\.\d+\.\d+)-\d+-commit-([0-9a-f]+)\.apk/;
    const match = apkAsset.name.match(regex);
    if (!match) {
        throw new Error('Invalid APK filename format');
    }

    const [, version, commitHash] = match;
    console.log(`Extracted version: ${version} and commit hash: ${commitHash} from APK filename`);
    const truncatedCommitHash = commitHash.substring(0, 6);
    const newFileName = `app-production-release-${version}-${truncatedCommitHash}.apk`;

    // Copy the APK into the directory Vercel expects it to be
    console.log('Downloading APK from source repository...');
    const apkBuffer = await github.rest.repos.getReleaseAsset({
        owner: SOURCE_FEDI_ORG,
        repo: SOURCE_FEDI_REPO,
        asset_id: apkAsset.id,
        headers: {
            Accept: 'application/octet-stream',
        },
    });

    // Convert ArrayBuffer to Buffer
    const buffer = Buffer.from(apkBuffer.data);

    console.log(`Writing APK to ui/apk/${newFileName}...`);
    fs.writeFileSync(`ui/apk/${newFileName}`, buffer);

    console.log('Reading and updating APK index.html...');
    const apkIndexHtml = fs.readFileSync('ui/apk/index.html').toString();
    const replacedHtml = apkIndexHtml.replace('{{path_to_apk}}', `./${newFileName}`);

    console.log('Writing updated index.html...');
    fs.writeFileSync('ui/apk/index.html', replacedHtml);
    console.log('index.html updated with APK download link:', newFileName);

    // Set output for next steps
    core.exportVariable('NEW_VERSION', version);
    core.exportVariable('NEW_APK_FILENAME', newFileName);
};