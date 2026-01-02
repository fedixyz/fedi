const exec = require("@actions/exec");

async function removeDirectory(dir) {
  console.log(`Removing directory if it exists: ${dir}`);
  // The '-f' flag ensures the command doesn't fail if the directory doesn't exist
  await exec.exec("rm", ["-rf", dir]);
}

async function syncRepos({ github, context, core }) {
  const {
    DOWNLOAD_TOKEN,
    PUBLISH_TOKEN,
    SOURCE_COMMIT_SHA,
    PUBLIC_FEDI_ORG,
    PUBLIC_FEDI_REPO,
    PUBLIC_FEDI_BRANCH = "master",
  } = process.env;

  if (
    !DOWNLOAD_TOKEN ||
    !PUBLISH_TOKEN ||
    !SOURCE_COMMIT_SHA ||
    !PUBLIC_FEDI_ORG ||
    !PUBLIC_FEDI_REPO
  ) {
    throw new Error("Missing required environment variables");
  }

  const sourceRepo = "fedibtc/fedi";
  const targetRepo = `${PUBLIC_FEDI_ORG}/${PUBLIC_FEDI_REPO}`;

  console.log(`Starting sync process for commit ${SOURCE_COMMIT_SHA}`);

  try {
    // Remove existing directories if they exist
    await removeDirectory("source_repo");
    await removeDirectory("target_repo");

    // Clone the source repository
    console.log(`Cloning source repository: ${sourceRepo}`);
    await exec.exec("git", [
      "clone",
      `https://${DOWNLOAD_TOKEN}@github.com/${sourceRepo}.git`,
      "source_repo",
    ]);

    // Fetch the specific commit
    console.log(`Fetching commit ${SOURCE_COMMIT_SHA} from source repo`);
    await exec.exec("git", [
      "-C",
      "source_repo",
      "fetch",
      "origin",
      SOURCE_COMMIT_SHA,
    ]);

    // Checkout the specific commit in the source repo
    console.log(`Checking out commit ${SOURCE_COMMIT_SHA} in source repo`);
    await exec.exec("git", [
      "-C",
      "source_repo",
      "checkout",
      SOURCE_COMMIT_SHA,
    ]);

    // Clone the target repository
    console.log(`Cloning target repository: ${targetRepo}`);
    await exec.exec("git", [
      "clone",
      `https://${PUBLISH_TOKEN}@github.com/${targetRepo}.git`,
      "target_repo",
    ]);

    // Pick or create a branch
    const shortSha = SOURCE_COMMIT_SHA.substring(0, 7);
    let branchName;
    process.env.CI
      ? (branchName = PUBLIC_FEDI_BRANCH)
      : (branchName = `release-${shortSha}`);
    console.log(`Creating new branch: ${branchName}`);
    try {
      console.log("Trying to sync to an existing branch");
      await exec.exec("git", ["-C", "target_repo", "checkout", branchName]);
    } catch {
      console.warn(
        "Likely failed because the branch is not there yet, and we're syncing de novo"
      );
      await exec.exec("git", [
        "-C",
        "target_repo",
        "checkout",
        "-b",
        branchName,
      ]);
    }

    await exec.exec("git", ["-C", "target_repo", "checkout", branchName]);

    // Copy all files from source to target (excluding .git directory)
    console.log("Copying files from source to target");
    await exec.exec("rsync", [
      "-av",
      "--exclude=.git",
      "--delete",
      "source_repo/",
      "target_repo/",
    ]);

    console.log("Setting up git config in target repo");
    await exec.exec("git", [
      "-C",
      "target_repo",
      "config",
      "user.name",
      "Fedi CI",
    ]);
    await exec.exec("git", [
      "-C",
      "target_repo",
      "config",
      "user.email",
      "ci@fedi.xyz",
    ]);

    // Add all changes
    console.log("Adding all changes");
    await exec.exec("git", ["-C", "target_repo", "add", "-A"]);

    // Commit changes in the target repo
    console.log("Committing changes in target repo");
    await exec.exec("git", [
      "-C",
      "target_repo",
      "commit",
      "-m",
      `Sync with fedibtc/fedi ${SOURCE_COMMIT_SHA}`,
    ]);

    // Push the new branch to the target repo
    console.log(`Pushing branch ${branchName} to target repo`);
    await exec.exec("git", [
      "-C",
      "target_repo",
      "push",
      "-u",
      "origin",
      branchName,
    ]);

    console.log(
      `Successfully pushed changes to branch ${branchName} in ${targetRepo}`
    );
    console.log(
      `Successfully synced repositories at commit ${SOURCE_COMMIT_SHA}`
    );
  } catch (error) {
    console.error(`Error syncing repositories: ${error.message}`);
    console.error(error.stack);
    core.setFailed(`Error syncing repositories: ${error.message}`);
  } finally {
    // Clean up: remove the cloned repositories
    await removeDirectory("source_repo");
    await removeDirectory("target_repo");
  }
}

// For GitHub Actions
module.exports = syncRepos;

// For local testing
if (require.main === module) {
  (async () => {
    const { Octokit } = await import("@octokit/rest");
    const localGithub = {
      getOctokit: (token) => new Octokit({ auth: token }),
    };
    const localCore = {
      setFailed: console.error,
    };
    await syncRepos({ github: localGithub, context: {}, core: localCore });
  })().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
}
