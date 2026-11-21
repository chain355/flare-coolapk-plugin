/**
 * Local harness: evaluates the built plugin.js in a bare sandbox (no process,
 * require, timers or Buffer), stubs the Host bridge and talks to the live
 * Coolapk API through Node's fetch. Used to verify mapping and paging.
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { randomBytes } from "node:crypto";

const source = readFileSync(new URL("../plugin.js", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
// API v1 hosts approve only the account origin, so the harness instance is the API host.
const instanceOrigin = "https://api.coolapk.com";
const state = { credential: null };
const log = (...args) => console.log(...args);

async function request(spec) {
  const headers = { ...(spec.headers ?? {}) };
  if (spec.cookies) headers.Cookie = spec.cookies.map((pair) => `${pair.name}=${pair.value}`).join("; ");
  const response = await fetch(spec.url, { headers });
  const body = await response.text();
  if (process.env.DUMP && spec.url.includes("/v6/main/init")) console.log("DUMP", spec.url, response.status, body.slice(0, 240));
  return { status: response.status, headers: {}, body };
}

const flare = {
  http: { request },
  credential: {
    read: async () => state.credential,
    replace: async (value) => {
      state.credential = value;
      return true;
    },
  },
  crypto: {
    randomHex: async (size) => randomBytes(size).toString("hex"),
    uuid: async () => "00000000-0000-4000-8000-000000000000",
    sha256: async (value) => value,
    md5: async (value) => value,
  },
  locale: { current: async () => "zh-CN" },
  error: (value) => {
    const error = new Error(value.message?.value ?? value.code);
    error.pluginError = value;
    return error;
  },
};

const context = { defineFlareSocialPlugin: (definition) => (context.definition = definition), flare, console };
vm.createContext(context);
vm.runInContext(source, context, { filename: "plugin.js" });

const host = { pluginId: "app.dimension.flare.plugin.coolapk", platformId: "Coolapk", packageHash: "harness", scope: "account", origin: instanceOrigin, locale: "zh-CN", approvedOrigins: [instanceOrigin, "https://api.coolapk.com"], credentialAvailable: true, assetHandles: [] };
const capability = (name) => {
  if (!context.definition.capabilities?.[name]) throw new Error(`missing capability ${name}`);
  return context.definition.capabilities[name];
};

const step = async (label, fn) => {
  try {
    const value = await fn();
    log(`✓ ${label}`);
    return value;
  } catch (error) {
    log(`✗ ${label}: ${error?.pluginError?.code ?? ""} ${error.message}`);
    return null;
  }
};

await step("detector detects api origin", async () => {
  const result = await context.definition.detector.detect({ origin: instanceOrigin }, { ...host, scope: "detector" });
  log("  match:", result.match, "software:", result.software, "instance:", result.instance?.title);
  if (result.match !== "exact") throw new Error("not detected");
});

await step("detector rejects unrelated host", async () => {
  const result = await context.definition.detector.detect({ origin: "https://mastodon.social" }, { ...host, scope: "detector" });
  if (result.match !== "none") throw new Error("false positive");
});

const login = await step("guest login", () =>
  context.definition.login.guest.begin({ methodId: "guest", origin: host.origin, flowId: "f", values: {} }, { ...host, scope: "login" }),
);
if (login) {
  state.credential = login.value.credential;
  log("  deviceId:", state.credential.deviceId, "profile:", login.value.profile.displayName);
}

await step("empty follow timeline", async () => {
  const page = await capability("timeline").page(
    { timelineId: "follow", page: { direction: "refresh", limit: 20, parameters: {} }, parameters: {} },
    host,
  );
  if (page.items.length !== 0) throw new Error("expected empty");
});

await step("local follow uid 45849820", async () => {
  const result = await capability("relation").mutate(
    { key: { id: "45849820", host: "www.coolapk.com" }, action: "Follow", parameters: {} },
    host,
  );
  if (!result.relation.following) throw new Error("not following");
  if (!state.credential.users.length) throw new Error("credential not written");
  log("  stored:", JSON.stringify(state.credential.users[0]).slice(0, 120));
});

const timeline = await step("follow timeline with 1 user", () =>
  capability("timeline").page(
    { timelineId: "follow", page: { direction: "refresh", limit: 20, parameters: {} }, parameters: {} },
    host,
  ),
);
if (timeline) {
  const first = timeline.items[0]?.post;
  log("  items:", timeline.items.length);
  log("  first:", first?.key.id, first?.author?.displayName, first?.createdAt);
  log("  content:", JSON.stringify(first?.content?.value ?? "").slice(0, 80));
  log("  media:", (first?.media ?? []).length, "url:", first?.media?.[0]?.url);
  log("  headers:", JSON.stringify(first?.media?.[0]?.customHeaders));
  log("  topic:", JSON.stringify(first?.sourceChannel ?? null));
}

const search = await step("search posts", () =>
  capability("search").posts({ query: "主机", page: { direction: "refresh", limit: 20, parameters: {} } }, host),
);
if (search) {
  log("  results:", search.items.length, "cursor:", search.olderCursor);
  log("  sample:", JSON.stringify(search.items[0]?.post?.content?.value ?? "").slice(0, 60));
}

const pictured = await step("search posts with images", () =>
  capability("search").posts({ query: "风景", page: { direction: "refresh", limit: 20, parameters: {} } }, host),
);
if (pictured) {
  const post = pictured.items.find((item) => item.post?.media?.length)?.post;
  log("  media count:", post?.media?.length, "first:", post?.media?.[0]?.url);
  log("  custom headers:", JSON.stringify(post?.media?.[0]?.customHeaders));
  log("  proxied:", (post?.media ?? []).some((entry) => entry.url.startsWith("https://wsrv.nl/")));
  log("  https only:", (post?.media ?? []).every((entry) => entry.url.startsWith("https://")));
}

const repost = await step("repost mapping", async () => {
  const page = await capability("search").posts({ query: "转发", page: { direction: "refresh", limit: 20, parameters: {} } }, host);
  const withQuote = page.items.filter((item) => item.presentation?.repost).length;
  log("  items:", page.items.length, "with presentation.repost:", withQuote);
  if (!withQuote) throw new Error("no reposted item in sample");
});

const profiles = await step("search profiles", () =>
  capability("search").profiles({ query: "斌哥", page: { direction: "refresh", limit: 20, parameters: {} } }, host),
);
if (profiles) log("  results:", profiles.items.length, "first:", profiles.items[0]?.handle, profiles.items[0]?.followersCount);

await step("profile byId for anonymous account", async () => {
  const me = await capability("profile").byId({ key: { id: "coolapk-anonymous", host: "api.coolapk.com" } }, host);
  log("  ", me.key.id, me.displayName);
  if (me.key.id !== "coolapk-anonymous") throw new Error("wrong key");
});

const profile = await step("profile byId", () =>
  capability("profile").byId({ key: { id: "45849820", host: "www.coolapk.com" } }, host),
);
if (profile) log("  ", profile.handle, profile.followersCount, profile.postsCount, profile.avatarUrl);

const byHandle = await step("profile byHandle", () =>
  capability("profile").byHandle({ handle: "斌哥玩机", host: "www.coolapk.com" }, host),
);
if (byHandle) log("  ", byHandle.key.id, byHandle.displayName);

await step("profile timeline", async () => {
  const page = await capability("profile").timeline(
    { profile: { id: "45849820", host: "www.coolapk.com" }, page: { direction: "refresh", limit: 20, parameters: {} }, parameters: {} },
    host,
  );
  log("  items:", page.items.length);
});

await step("relation state", async () => {
  const relation = await capability("relation").state({ key: { id: "45849820", host: "www.coolapk.com" } }, host);
  if (!relation.following) throw new Error("expected following");
});

await step("unfollow", async () => {
  const result = await capability("relation").mutate(
    { key: { id: "45849820", host: "www.coolapk.com" }, action: "Unfollow", parameters: {} },
    host,
  );
  if (result.relation.following) throw new Error("still following");
  if (state.credential.users.length) throw new Error("credential not cleaned");
});
