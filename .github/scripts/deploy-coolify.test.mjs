import assert from "node:assert/strict";
import test from "node:test";
import { configuration, deploy } from "./deploy-coolify.mjs";

const env = {
  GITHUB_EVENT_NAME: "push",
  GITHUB_REF_NAME: "chore/web-ghcr-images",
  COOLIFY_URL: "https://coolify.example.com",
  COOLIFY_TOKEN: "private-coolify-token",
  GH_TOKEN: "private-github-token",
  GITHUB_REPOSITORY: "owner/irtaki",
  GITHUB_RUN_NUMBER: "100",
  IMAGE_NAME: "ghcr.io/owner/irtaki-web",
  IMAGE_DIGEST: `sha256:${"a".repeat(64)}`,
  COOLIFY_APPLICATION_UUID: "web123",
  DEPLOY_WORKFLOW_FILE: "mobile-ci.yml",
  DEPLOY_HEALTH_URL: "https://web.example.com/healthz",
};
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), { status });

function fixture(options = {}) {
  const calls = [],
    messages = [],
    summaries = [];
  let clock = 0,
    queued = false,
    activeChecks = 0;
  const app = {
    id: 5,
    uuid: "web123",
    build_pack: "dockerimage",
    docker_registry_image_name: env.IMAGE_NAME,
    docker_registry_image_tag: "previous-tag",
    status: "running:healthy",
    ...options.app,
  };
  const fetchImpl = async (url, init = {}) => {
    const target = new URL(url),
      path = target.pathname,
      method = init.method ?? "GET";
    calls.push({
      url: String(url),
      path,
      method,
      body: init.body,
      headers: init.headers,
    });
    const override = await options.respond?.({
      url: target,
      path,
      method,
      init,
      app,
      queued,
    });
    if (override) return override;
    if (target.hostname === "api.github.com")
      return json({ workflow_runs: options.runs ?? [] });
    if (target.hostname === "web.example.com")
      return new Response("ok", { status: options.healthStatus ?? 200 });
    if (path === "/api/v1/applications/web123" && method === "PATCH") {
      Object.assign(app, JSON.parse(init.body));
      return json({ uuid: app.uuid });
    }
    if (path === "/api/v1/applications/web123") return json(app);
    if (path === "/api/v1/deployments/applications/web123") {
      activeChecks++;
      return json({
        deployments:
          options.activeFirst && activeChecks === 1
            ? [{ status: "in_progress" }]
            : [],
      });
    }
    if (path === "/api/v1/deploy" && method === "POST") {
      queued = true;
      return json({
        deployments: [
          { resource_uuid: app.uuid, deployment_uuid: "deploy123" },
        ],
      });
    }
    if (path === "/api/v1/deployments/deploy123") {
      return json({
        deployment_uuid: "deploy123",
        application_id: "5",
        status: options.deploymentStatus ?? "finished",
      });
    }
    throw new Error(`Unexpected test request: ${method} ${path}`);
  };
  return {
    calls,
    messages,
    summaries,
    run: (overrides = {}) =>
      deploy(
        { ...env, ...overrides },
        {
          fetchImpl,
          now: () => clock,
          sleep: async (ms) => {
            clock += ms;
          },
          timeoutMs: 30_000,
          log: (message) => messages.push(message),
          summary: async (text) => summaries.push(text),
        },
      ),
  };
}

test("pins the verified digest, queues one deployment, then checks health without leaking tokens", async () => {
  const f = fixture();
  assert.equal((await f.run()).status, "healthy");
  const mutations = f.calls.filter((c) => c.method !== "GET");
  assert.deepEqual(
    mutations.map((c) => c.method),
    ["PATCH", "POST"],
  );
  assert.deepEqual(JSON.parse(mutations[0].body), {
    docker_registry_image_tag: `sha256-${"a".repeat(64)}`,
  });
  assert.deepEqual(JSON.parse(mutations[1].body), {
    uuid: "web123",
    force: false,
  });
  assert.ok(f.summaries.some((s) => s.includes("previous-tag")));
  assert.equal(
    f.calls.at(-1).headers,
    undefined,
    "public health request must not receive the API token",
  );
  assert.doesNotMatch(
    [...f.messages, ...f.summaries].join("\n"),
    /private-coolify-token|private-github-token/,
  );
});

for (const override of [
  { GITHUB_EVENT_NAME: "pull_request" },
  { GITHUB_EVENT_NAME: "workflow_dispatch" },
  { GITHUB_REF_NAME: "untrusted-branch" },
  { COOLIFY_URL: "http://coolify.example.com" },
  { IMAGE_DIGEST: "latest" },
  { COOLIFY_APPLICATION_UUID: "../other" },
  { COOLIFY_TOKEN: "" },
]) {
  test(`rejects unsafe deployment input before any network request: ${JSON.stringify(override)}`, async () => {
    const f = fixture();
    await assert.rejects(f.run(override));
    assert.equal(f.calls.length, 0);
  });
}

test("also accepts main pushes", () => {
  assert.equal(
    configuration({ ...env, GITHUB_REF_NAME: "main" }).imageTag,
    `sha256-${"a".repeat(64)}`,
  );
});

test("does not deploy to an application with a different image or build method", async () => {
  for (const app of [
    { build_pack: "dockercompose" },
    { docker_registry_image_name: "ghcr.io/owner/other" },
  ]) {
    const f = fixture({ app });
    await assert.rejects(f.run(), /does not match/);
    assert.ok(f.calls.every((c) => c.method === "GET"));
  }
});

test("skips older runs across both allowed branches before changing application configuration", async () => {
  for (const head_branch of ["main", "chore/web-ghcr-images"]) {
    const f = fixture({
      runs: [
        { event: "push", head_branch, run_number: 101, status: "in_progress" },
      ],
    });
    assert.equal((await f.run()).status, "superseded");
    assert.equal(f.calls.length, 1);
  }
});

test("failed newer runs and PR runs do not prevent the latest working push from deploying", async () => {
  const f = fixture({
    runs: [
      {
        event: "push",
        head_branch: "main",
        run_number: 101,
        status: "completed",
        conclusion: "failure",
      },
      {
        event: "pull_request",
        head_branch: "main",
        run_number: 102,
        status: "in_progress",
      },
    ],
  });
  assert.equal((await f.run()).status, "healthy");
});

test("waits for an existing manual deployment before mutating the image setting", async () => {
  const f = fixture({ activeFirst: true });
  await f.run();
  const patch = f.calls.findIndex((c) => c.method === "PATCH");
  assert.equal(
    f.calls
      .slice(0, patch)
      .filter((c) => c.path.includes("/deployments/applications/")).length,
    2,
  );
});

test("a newer candidate appearing while waiting prevents deployment", async () => {
  let checks = 0;
  const f = fixture({
    respond: ({ url }) => {
      if (url.hostname !== "api.github.com") return;
      checks++;
      return json({
        workflow_runs:
          checks > 1
            ? [
                {
                  event: "push",
                  head_branch: "main",
                  run_number: 101,
                  status: "completed",
                  conclusion: "success",
                },
              ]
            : [],
      });
    },
  });
  assert.equal((await f.run()).status, "superseded");
  assert.ok(f.calls.every((c) => c.method === "GET"));
});

test("fails on Coolify deployment failure rather than accepting a still-healthy old endpoint", async () => {
  const f = fixture({ deploymentStatus: "failed" });
  await assert.rejects(f.run(), /deployment failed/);
  assert.ok(!f.calls.some((c) => c.url === env.DEPLOY_HEALTH_URL));
});

test("times out a stuck deployment", async () => {
  await assert.rejects(
    fixture({ deploymentStatus: "in_progress" }).run(),
    /Timed out/,
  );
});

test("requires the public endpoint to return 200", async () => {
  await assert.rejects(fixture({ healthStatus: 503 }).run(), /Timed out/);
});

test("requires Coolify container health in addition to deployment completion", async () => {
  const f = fixture({ app: { status: "running:unhealthy" } });
  await assert.rejects(f.run(), /Timed out/);
});

test("fails without replaying a deployment POST when the API returns an error", async () => {
  const f = fixture({
    respond: ({ method, path }) =>
      method === "POST" && path === "/api/v1/deploy"
        ? json({ message: "sensitive error content" }, 500)
        : undefined,
  });
  await assert.rejects(
    f.run(),
    (error) =>
      error.message.includes("HTTP 500") &&
      !error.message.includes("sensitive"),
  );
  assert.equal(f.calls.filter((c) => c.method === "POST").length, 1);
});

test("rejects a deployment UUID belonging to another application", async () => {
  const f = fixture({
    respond: ({ path }) =>
      path === "/api/v1/deployments/deploy123"
        ? json({
            deployment_uuid: "deploy123",
            application_id: "999",
            status: "finished",
          })
        : undefined,
  });
  await assert.rejects(f.run(), /different application/);
});
