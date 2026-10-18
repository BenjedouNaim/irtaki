import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const BRANCHES = new Set(["main", "chore/web-ghcr-images"]);
const ACTIVE = new Set(["queued", "in_progress"]);
const TERMINAL_FAILURE = new Set(["failed", "cancelled-by-user", "cancelled"]);

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function httpsUrl(value, name) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error(
      `${name} must be an HTTPS URL without credentials or a fragment`,
    );
  }
  return url;
}

export function configuration(env) {
  if (env.GITHUB_EVENT_NAME !== "push" || !BRANCHES.has(env.GITHUB_REF_NAME)) {
    throw new Error("Only pushes to main or chore/web-ghcr-images may deploy");
  }
  const base = httpsUrl(required(env, "COOLIFY_URL"), "COOLIFY_URL");
  if (base.pathname !== "/" || base.search)
    throw new Error("COOLIFY_URL must be an origin URL");
  const imageName = required(env, "IMAGE_NAME");
  const digest = required(env, "IMAGE_DIGEST");
  const application = required(env, "COOLIFY_APPLICATION_UUID");
  const workflow = required(env, "DEPLOY_WORKFLOW_FILE");
  if (!/^ghcr\.io\/[a-z0-9_.-]+\/irtaki-(backend|web)$/.test(imageName)) {
    throw new Error("Unexpected GHCR image name");
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(digest))
    throw new Error("Invalid image digest");
  if (!/^[a-zA-Z0-9_-]+$/.test(application))
    throw new Error("Invalid application UUID");
  if (!/^(backend|mobile)-ci\.yml$/.test(workflow))
    throw new Error("Unexpected caller workflow");
  const runNumber = Number(required(env, "GITHUB_RUN_NUMBER"));
  if (!Number.isSafeInteger(runNumber) || runNumber < 1)
    throw new Error("Invalid workflow run number");
  const repository = required(env, "GITHUB_REPOSITORY");
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository))
    throw new Error("Invalid repository");
  return {
    base: base.origin,
    token: required(env, "COOLIFY_TOKEN"),
    githubToken: required(env, "GH_TOKEN"),
    application,
    imageName,
    digest,
    // Coolify 4.4.6 converts sha256-<hash> to image@sha256:<hash>.
    imageTag: digest.replace(":", "-"),
    health: httpsUrl(required(env, "DEPLOY_HEALTH_URL"), "DEPLOY_HEALTH_URL")
      .href,
    workflow,
    repository,
    runNumber,
  };
}

export async function deploy(
  env,
  {
    fetchImpl = fetch,
    sleep = delay,
    now = Date.now,
    log = console.log,
    summary = async (text) => {
      if (env.GITHUB_STEP_SUMMARY)
        await appendFile(env.GITHUB_STEP_SUMMARY, `${text}\n`);
    },
    timeoutMs = 15 * 60_000,
  } = {},
) {
  const config = configuration(env);
  const deadline = now() + timeoutMs;
  const checkDeadline = () => {
    if (now() >= deadline)
      throw new Error("Timed out waiting for Coolify deployment and health");
  };

  async function request(url, token, method = "GET", body) {
    checkDeadline();
    // Never retry mutations automatically: an interrupted POST may already have queued a deployment.
    const attempts = method === "GET" ? 3 : 1;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      let response;
      try {
        response = await fetchImpl(url, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          redirect: "error",
          signal: AbortSignal.timeout(
            Math.max(1, Math.min(20_000, deadline - now())),
          ),
        });
      } catch {
        if (attempt < attempts) {
          await sleep(attempt * 2000);
          continue;
        }
        throw new Error(
          `${method} ${new URL(url).pathname}: network request failed`,
        );
      }
      if (response.status >= 500 && attempt < attempts) {
        await sleep(attempt * 2000);
        continue;
      }
      // Do not echo response bodies: API errors can include sensitive configuration.
      if (!response.ok)
        throw new Error(
          `${method} ${new URL(url).pathname}: HTTP ${response.status}`,
        );
      try {
        return await response.json();
      } catch {
        throw new Error(
          `${method} ${new URL(url).pathname}: invalid JSON response`,
        );
      }
    }
  }
  const api = (path, method, body) =>
    request(`${config.base}/api/v1${path}`, config.token, method, body);

  async function superseded() {
    const runs = await request(
      `https://api.github.com/repos/${config.repository}/actions/workflows/${config.workflow}/runs?event=push&per_page=100`,
      config.githubToken,
    );
    if (!Array.isArray(runs.workflow_runs))
      throw new Error("Invalid GitHub workflow-run response");
    // These workflows path-filter pushes, so every push run represents a candidate for this component.
    return runs.workflow_runs.some(
      (run) =>
        run.event === "push" &&
        BRANCHES.has(run.head_branch) &&
        run.run_number > config.runNumber &&
        (run.status !== "completed" || run.conclusion === "success"),
    );
  }
  async function skipIfSuperseded() {
    if (!(await superseded())) return false;
    log(
      "Skipping deployment: a newer eligible run already exists for this component.",
    );
    await summary(
      "Deployment skipped because a newer eligible workflow run exists.",
    );
    return true;
  }
  if (await skipIfSuperseded()) return { status: "superseded" };

  const appPath = `/applications/${config.application}`;
  const validateApplication = (app) => {
    if (
      app.uuid !== config.application ||
      app.build_pack !== "dockerimage" ||
      app.docker_registry_image_name !== config.imageName
    ) {
      throw new Error(
        "Coolify application does not match the expected Docker Image resource",
      );
    }
  };
  validateApplication(await api(appPath));
  // Wait for manual deployments as well as Actions deployments before changing the image setting.
  while (true) {
    const history = await api(
      `/deployments/applications/${config.application}?take=100`,
    );
    if (!Array.isArray(history.deployments))
      throw new Error("Invalid Coolify deployment-list response");
    if (!history.deployments.some((item) => ACTIVE.has(item.status))) break;
    log("Waiting for an existing Coolify deployment to finish.");
    checkDeadline();
    await sleep(10_000);
  }
  if (await skipIfSuperseded()) return { status: "superseded" };

  const previous = await api(appPath);
  validateApplication(previous);
  const previousTag = previous.docker_registry_image_tag;
  const previousReference = previousTag?.startsWith("sha256-")
    ? `${config.imageName}@${previousTag.replace("sha256-", "sha256:")}`
    : `${config.imageName}:${previousTag}`;
  await summary(`Previous image: \`${previousReference}\``);
  await summary(`Requested image: \`${config.imageName}@${config.digest}\``);
  await api(appPath, "PATCH", { docker_registry_image_tag: config.imageTag });
  const updated = await api(appPath);
  if (
    updated.docker_registry_image_name !== config.imageName ||
    updated.docker_registry_image_tag !== config.imageTag
  ) {
    throw new Error("Coolify did not retain the requested image digest");
  }
  const result = await api("/deploy", "POST", {
    uuid: config.application,
    force: false,
  });
  const matches = result.deployments?.filter(
    (item) => item.resource_uuid === config.application,
  );
  if (
    matches?.length !== 1 ||
    !/^[a-zA-Z0-9_-]+$/.test(matches[0].deployment_uuid ?? "")
  ) {
    throw new Error(
      "Coolify did not return exactly one matching deployment UUID",
    );
  }
  const deploymentId = matches[0].deployment_uuid;
  log(`Coolify deployment queued: ${deploymentId}`);
  await summary(`Deployment: \`${deploymentId}\``);
  let lastStatus;
  while (true) {
    const state = await api(`/deployments/${deploymentId}`);
    // The queued UUID was bound to this application by /deploy's resource_uuid.
    // Application GET deliberately hides its internal numeric id in Coolify 4.4.6.
    if (state.deployment_uuid !== deploymentId)
      throw new Error("Coolify returned a different deployment UUID");
    if (state.status !== lastStatus) {
      log(`Deployment status: ${state.status}`);
      lastStatus = state.status;
    }
    if (TERMINAL_FAILURE.has(state.status))
      throw new Error(
        `Coolify deployment ${state.status}; inspect its dashboard logs`,
      );
    if (state.status === "finished") break;
    if (!ACTIVE.has(state.status))
      throw new Error("Unknown Coolify deployment status");
    checkDeadline();
    await sleep(10_000);
  }
  while (true) {
    const app = await api(appPath);
    if (
      app.docker_registry_image_name !== config.imageName ||
      app.docker_registry_image_tag !== config.imageTag
    ) {
      throw new Error(
        "Application image changed during deployment verification",
      );
    }
    if (app.status === "running:healthy") {
      let response;
      try {
        response = await fetchImpl(config.health, {
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        /* A public endpoint can lag the container's readiness briefly. */
      }
      if (response?.status === 200) {
        log(`Deployment healthy: ${config.health}`);
        await summary(`Verified healthy over HTTPS: ${config.health}`);
        return {
          status: "healthy",
          deploymentId,
          image: `${config.imageName}@${config.digest}`,
        };
      }
    }
    checkDeadline();
    await sleep(10_000);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  deploy(process.env).catch((error) => {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  });
}
