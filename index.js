const core = require("@actions/core");
const github = require("@actions/github");
const issueParser = require("issue-parser");
const parse = issueParser("github");
const { template } = require("lodash");

function delay(time) {
  return new Promise(resolve => setTimeout(resolve, time));
}

async function run() {
  try {
    const token = core.getInput("token");
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;

    // Get the message template from the user input
    const messageTemplate =
      core.getInput("message", { required: false }) ||
      ":tada: This PR is included in [${releaseTag}](${releaseUrl}) :tada:";

    const release_tag = core.getInput("release-tag", { required: false });

    const { data: release } = release_tag ?
      await octokit.rest.repos.getReleaseByTag({ owner, repo, tag: release_tag }) :
      await octokit.rest.repos.getRelease({ owner, repo, release_id: "latest" });

    // Parse the release notes to extract the pull request numbers
    const prNumbers = [...new Set(parse(release.body).refs.map((ref) => ref.issue))];

    // Used to print out pull request urls
    const pullRequestUrls = [];
    let failedComments = 0;

    // Post a comment on each pull request
    for (const prNumberStr of prNumbers) {
      const prNumber = parseInt(prNumberStr);

      await delay(1000);

      try {
        const { data: pullRequest } = await octokit.rest.issues.get({
          owner,
          repo,
          issue_number: prNumber,
        });
        const message = template(messageTemplate)({
          releaseName: release.name,
          releaseTag: release.tag_name,
          releaseUrl: release.html_url,
          pullRequestTitle: pullRequest.title,
          pullRequestUrl: pullRequest.html_url,
          pullRequestNumber: prNumber,
        });
        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: prNumber,
          body: message,
        });
        pullRequestUrls.push(pullRequest.html_url);
      } catch (error) {
        console.error(`Failed to comment on #${prNumber}`, error);
        failedComments += 1;
      }
    }

    console.log("Commented on PRs included in release:");
    pullRequestUrls.forEach((url) => console.log(url));

    if (failedComments > 0) {
      core.setFailed(`Failed to comment on ${failedComments} PRs`);
    }
  } catch (error) {
    console.error(error);
    core.setFailed(error.message);
  }
}

run();
