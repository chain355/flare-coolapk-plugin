/**
 * 酷安 (Coolapk) read-only social adapter.
 *
 * Boundary: anonymous browsing only. Following is local — the account credential
 * holds followed uids and the home timeline merges their feeds in a rotating
 * batch. After the optional one-shot import, no request carries a login cookie.
 *
 * Post detail / reply lists are captcha-gated on api.coolapk.com, so posts
 * navigate to the Coolapk web page instead of a native detail screen.
 */
import {
  accountHeaders,
  API_ORIGIN,
  apiGet,
  fetchUserFeed,
  LOGIN_URL,
  MEDIA_USER_AGENT,
  WEB_ORIGIN,
  type CoolapkCredential,
  type FollowedUser,
} from "./coolapk";

/** Replaced by build.mjs: true for the Host API v2 package, false for API v1. */
declare const __V2__: boolean;
/** Replaced by build.mjs: image proxy prefix for v1 builds ("" disables proxying). */
declare const __IMAGE_PROXY__: string;

const FOLLOW_BATCH = 20;
const FEED_PER_USER = 12;
const IMPORT_PAGE_LIMIT = 20;
const IMPORT_USER_LIMIT = 400;
/** API v1 hosts only approve the account origin, so requests must target its host. */
const V1_API_HOST = "api.coolapk.com";
/** 匿名账号没有真实 uid，宿主会用这个 id 反查「我的主页」。 */
const ANONYMOUS_ACCOUNT_ID = "coolapk-anonymous";
/** 只在导入卡住时出现的诊断账号：名字就是结论，不会覆盖原有的匿名账号。 */
const DIAGNOSTIC_ACCOUNT_ID = "coolapk-diag";
/** 宿主每 2 秒轮询一次 Cookie；超过这个次数仍拿不到可用的登录态就把原因写进错误里。 */
const CHECK_TICKS_BEFORE_HINT = 25;
let checkTicks = 0;

const CAPABILITIES: Record<string, string[]> = {
  "flare.datasource.timeline/v1": ["page"],
  // API v1 exposes search only when every declared operation is implemented.
  "flare.datasource.search/v1": __V2__
    ? ["posts", "profiles"]
    : ["posts", "profiles", "discoverPosts", "discoverProfiles", "discoverHashtags"],
  "flare.datasource.profile/v1": ["byId", "byHandle", "timeline"],
  "flare.datasource.relation/v1": ["state", "mutate"],
};

defineFlareSocialPlugin({
  detector: {
    async detect(request) {
      // 检测只发一次 probe：酷安 API 域名回 data，网页域名回 "/v6 not found"。
      const host = hostOf(request.origin);
      if (host !== "api.coolapk.com" && host !== "www.coolapk.com") {
        return { match: "none" as const, canonicalOrigin: request.origin };
      }
      const deviceId = await flare.crypto.randomHex(16);
      const credential: CoolapkCredential = { deviceId, users: [] };
      // 检测阶段只能访问用户输入的域名，所以直接请求 origin 而不是写死的 API 域。
      const base = request.origin.replace(/\/$/, "");
      let body: { data?: unknown; message?: unknown };
      try {
        const response = await flare.http.request({
          url: `${base}/v6/main/init`,
          headers: accountHeaders(credential),
          timeoutMillis: 8000,
        });
        if (response.status < 200 || response.status >= 300) {
          return { match: "none" as const, canonicalOrigin: request.origin };
        }
        body = JSON.parse(response.body) as { data?: unknown; message?: unknown };
      } catch {
        return { match: "none" as const, canonicalOrigin: request.origin };
      }
      const looksCoolapk =
        Array.isArray(body.data) || String(body.message ?? "").includes("/v6 not found");
      if (!looksCoolapk) return { match: "none" as const, canonicalOrigin: request.origin };
      return {
        match: "exact" as const,
        canonicalOrigin: request.origin,
        software: "Coolapk",
        instance: { domain: host, title: "酷安" },
      };
    },
  },
  login: {
    guest: {
      async begin(request, context) {
        accountHost(context);
        const requested = (request.values.device ?? "").trim();
        if (requested && !/^[0-9a-fA-F]{16,64}$/.test(requested)) {
          fail("Validation", "设备标识只能包含 16–64 位十六进制字符");
        }
        const deviceId = requested ? requested.toLowerCase() : await flare.crypto.randomHex(16);
        const credential: CoolapkCredential = { deviceId, users: [] };
        // 探测一次匿名接口，确认当前网络能直连酷安。
        await apiGet(credential, "/v6/main/init", {}, { timeoutMillis: 15000 });
        return {
          type: "success",
          value: {
            accountId: ANONYMOUS_ACCOUNT_ID,
            origin: context.origin,
            credential: { ...credential } as unknown as JsonValue,
            profile: anonymousProfile(context),
            capabilities: CAPABILITIES,
          },
        };
      },
    },
    cookieImport: {
      async begin(request, context) {
        accountHost(context);
        const raw = (request.values.cookie ?? "").trim();
        if (!raw) fail("Validation", "缺少 Cookie");
        const pairs = parseCookieHeader(raw);
        if (!pairs.length) fail("Validation", "Cookie 格式不对，应形如 uid=1; token=xx; SESSID=xx");
        const credential: CoolapkCredential = {
          deviceId: await flare.crypto.randomHex(16),
          users: [],
        };
        const info = await fetchLoginInfo(credential, pairs).catch(() => null);
        if (!info) fail("AuthenticationRequired", "这段 Cookie 已失效，请重新登录后复制");
        const users = await importFollowing(credential, info.uid, pairs);
        if (!users.length) fail("Validation", "没有读到关注列表：确认这个账号确实有关注，或稍后重试");
        let profile: ProfileV1;
        try {
          profile = await fetchProfile(credential, info.uid, context, pairs);
        } catch {
          const username = info.username || info.uid;
          profile = {
            key: { id: info.uid, host: accountHost(context) },
            handle: username,
            displayName: username,
            avatarUrl: info.avatar,
            url: `${WEB_ORIGIN}/u/${info.uid}`,
          };
        }
        return {
          type: "success",
          value: {
            accountId: info.uid,
            origin: context.origin,
            credential: { deviceId: credential.deviceId, users } as unknown as JsonValue,
            profile,
            capabilities: CAPABILITIES,
          },
        };
      },
    },
    cookie: {
      async begin() {
        checkTicks = 0;
        return { type: "webCookie", startUrl: LOGIN_URL };
      },
      async check(request, context) {
        accountHost(context);
        const cookies = new Map<string, string>();
        for (const cookie of request.cookies.cookies) cookies.set(cookie.name, cookie.value);
        checkTicks += 1;
        const credential: CoolapkCredential = {
          deviceId: await flare.crypto.randomHex(16),
          users: [],
        };
        // 等了约一分钟还没有结果就收尾，把卡住的环节写进账号名，不再无限转圈。
        const giveUp = checkTicks > CHECK_TICKS_BEFORE_HINT;
        const token = cleanCookie(cookies.get("token"));
        const session = cleanCookie(cookies.get("SESSID"));
        // 登录页会把 token 先写成 "deleted"；没有 SESSID/token 说明还没登录。
        if (!session && !token) {
          if (giveUp) {
            return diagnosticSuccess(
              context,
              credential.deviceId,
              cookies.size ? "WebView 里还没登录成功" : "WebView 没交 Cookie",
            );
          }
          return { type: "pending" };
        }

        const cookiePairs: { name: string; value: string }[] = [];
        for (const name of ["uid", "username", "token", "validate", "SESSID"]) {
          const value = cleanCookie(cookies.get(name));
          if (value) cookiePairs.push({ name, value });
        }

        // 网页登录不一定写 uid，交给服务端确认身份（c001apk 用同一个接口取 uid）。
        const uidFromCookie = cleanCookie(cookies.get("uid"));
        let uid = /^\d+$/.test(uidFromCookie) ? uidFromCookie : "";
        let sessionUser: { username?: string; avatar?: string } | null = null;
        if (!uid) {
          let info: Awaited<ReturnType<typeof fetchLoginInfo>> = null;
          try {
            info = await fetchLoginInfo(credential, cookiePairs);
          } catch {
            info = null;
          }
          if (!info) {
            if (giveUp) return diagnosticSuccess(context, credential.deviceId, "Cookie 未被服务端认可");
            return { type: "pending" };
          }
          uid = info.uid;
          sessionUser = { username: info.username, avatar: info.avatar };
        }

        let users: FollowedUser[];
        try {
          users = await importFollowing(credential, uid, cookiePairs);
        } catch {
          // 还没真正登录（或该接口拒绝），继续等下一次轮询。
          if (giveUp) return diagnosticSuccess(context, credential.deviceId, "关注列表读不到");
          return { type: "pending" };
        }
        if (!users.length) return diagnosticSuccess(context, credential.deviceId, "关注列表是空的");
        const username = sessionUser?.username || cleanCookie(cookies.get("username")) || uid;
        let profile: ProfileV1;
        try {
          profile = await fetchProfile(credential, uid, context, cookiePairs);
        } catch {
          // 主页接口失败不影响导入：用服务端返回或 Cookie 里的用户名兜底。
          profile = {
            key: { id: uid, host: accountHost(context) },
            handle: username,
            displayName: username,
            avatarUrl: sessionUser?.avatar,
            url: `${WEB_ORIGIN}/u/${uid}`,
          };
        }
        // 导入完成后丢弃 Cookie：之后的请求全部回到匿名身份。
        return {
          type: "success",
          value: {
            accountId: uid,
            origin: context.origin,
            credential: { deviceId: credential.deviceId, users } as unknown as JsonValue,
            profile,
            capabilities: CAPABILITIES,
          },
        };
      },
    },
  },
  capabilities: {
    timeline: {
      async page(request, context) {
        if (request.timelineId !== "follow") fail("Unsupported", "未知时间线");
        const credential = await readCredential();
        const users = credential.users;
        if (!users.length) return { items: [], endReached: true };

        const limit = Math.min(Math.max(request.page.limit || 20, 1), 100);
        // 按上次刷新时间轮转，100+ 关注也不会在单次调用里打满 30 秒上限。
        const batch = users
          .slice()
          .sort((left, right) => (left.lastAt ?? 0) - (right.lastAt ?? 0))
          .slice(0, Math.min(FOLLOW_BATCH, users.length));

        const host = accountHost(context);
        const items: TimelineItemV1[] = [];
        const seen = new Set<string>();
        const fetched = new Set<string>();
        let failures = 0;

        for (const user of batch) {
          try {
            const feed = await fetchUserFeed(credential, user.uid, {
              page: 1,
              limit: FEED_PER_USER,
              includeTop: false,
            });
            fetched.add(user.uid);
            for (const raw of feed) {
              const item = toTimelineItem(raw, host);
              if (!item || item.type !== "post" || seen.has(item.post.key.id)) continue;
              seen.add(item.post.key.id);
              items.push(item);
            }
          } catch {
            failures++;
          }
        }

        if (failures === batch.length) fail("Network", "酷安动态加载失败，请稍后再试");

        const now = Date.now();
        for (const user of users) {
          if (fetched.has(user.uid)) user.lastAt = now;
        }
        await flare.credential
          .replace({ ...credential } as unknown as JsonValue)
          .catch(() => false);

        items.sort(compareCreatedAt);
        return { items: items.slice(0, limit), endReached: true };
      },
    },
    search: {
      posts: searchPosts,
      profiles: searchProfiles,
      // 酷安没有独立的「发现」流，API v1 又强制声明这三个操作：直接复用搜索结果。
      discoverPosts: searchPosts,
      discoverProfiles: searchProfiles,
      async discoverHashtags() {
        return { items: [], endReached: true };
      },
    },
    profile: {
      async byId(request, context) {
        // 宿主要求能按账号 id 取到「我的主页」，匿名账号没有真实 uid，直接返回本地档案。
        if (request.key.id === ANONYMOUS_ACCOUNT_ID || request.key.id === DIAGNOSTIC_ACCOUNT_ID) {
          const stored = await flare.credential.read().catch(() => null);
          const note = isCredential(stored) ? stored.note : undefined;
          return note ? diagnosticProfile(context, note) : anonymousProfile(context);
        }
        const credential = await readCredential();
        return fetchProfile(credential, request.key.id, context);
      },
      async byHandle(request, context) {
        const credential = await readCredential();
        const handle = request.handle.replace(/^@/, "").trim();
        if (!handle) fail("Validation", "缺少用户名");
        if (handle === "coolapk" || handle === "酷安匿名") return anonymousProfile(context);
        const body = await apiGet(credential, "/v6/search", { type: "user", searchValue: handle, page: 1 });
        const match = asArray(body.data).find(
          (raw) => String(raw.username ?? "").toLowerCase() === handle.toLowerCase(),
        );
        if (!match) fail("NotFound", `没有找到用户 ${handle}`);
        return mapProfile(match as Record<string, unknown>, accountHost(context));
      },
      async timeline(request, context) {
        // 匿名态只能取第一页：酷安会拒绝后续翻页，因此本列表为一次性分页。
        if (request.page.direction !== "refresh" && request.page.cursor) {
          return { items: [], endReached: true };
        }
        const credential = await readCredential();
        const host = accountHost(context);
        const feed = await fetchUserFeed(credential, request.profile.id, {
          page: 1,
          limit: Math.min(request.page.limit || 20, 30),
          includeTop: true,
        });
        const items: TimelineItemV1[] = [];
        for (const raw of feed) {
          const item = toTimelineItem(raw, host);
          if (item) items.push(item);
        }
        return { items, endReached: true };
      },
    },
    relation: {
      async state(request, context) {
        const credential = await readCredential();
        return {
          profileKey: { id: request.key.id, host: accountHost(context) },
          following: credential.users.some((user) => user.uid === request.key.id),
        };
      },
      async mutate(request, context) {
        const credential = await readCredential();
        const uid = request.key.id;
        const exists = credential.users.some((user) => user.uid === uid);
        if (request.action === "Follow") {
          if (!exists) {
            const token = parseActionToken(request.actionToken);
            let username = token?.username ?? "";
            let avatar = token?.avatar;
            if (!username) {
              try {
                const profile = await fetchProfile(credential, uid, context);
                username = profile.handle;
                avatar = profile.avatarUrl;
              } catch {
                username = uid;
              }
            }
            credential.users.push({ uid, username, avatar, lastAt: 0 });
            await flare.credential.replace({ ...credential } as unknown as JsonValue);
          }
          return {
            type: "updatedRelation",
            relation: { profileKey: { id: uid, host: accountHost(context) }, following: true },
          };
        }
        if (request.action === "Unfollow") {
          if (exists) {
            credential.users = credential.users.filter((user) => user.uid !== uid);
            await flare.credential.replace({ ...credential } as unknown as JsonValue);
          }
          return {
            type: "updatedRelation",
            relation: { profileKey: { id: uid, host: accountHost(context) }, following: false },
          };
        }
        fail("Unsupported", "只支持本地关注与取消关注");
      },
    },
  },
});

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

async function searchPosts(
  request: SearchRequestV1,
  context: PluginInvocationContextV1,
): Promise<PageV1<TimelineItemV1>> {
  const keyword = request.query.trim();
  if (!keyword) return { items: [], endReached: true };
  const credential = await readCredential();
  const page = pageNumber(request.page.cursor);
  const body = await apiGet(credential, "/v6/search", {
    type: "feed",
    searchValue: keyword,
    page,
    showAnonymous: -1,
  });
  const host = accountHost(context);
  const items: TimelineItemV1[] = [];
  for (const raw of asArray(body.data)) {
    const item = toTimelineItem(raw, host);
    if (item) items.push(item);
  }
  return {
    items,
    olderCursor: items.length ? String(page + 1) : undefined,
    endReached: !items.length,
  };
}

async function searchProfiles(
  request: SearchRequestV1,
  context: PluginInvocationContextV1,
): Promise<PageV1<ProfileV1>> {
  const keyword = request.query.trim();
  if (!keyword) return { items: [], endReached: true };
  const credential = await readCredential();
  const page = pageNumber(request.page.cursor);
  const body = await apiGet(credential, "/v6/search", {
    type: "user",
    searchValue: keyword,
    page,
  });
  const host = accountHost(context);
  const items = asArray(body.data)
    .map((raw) => mapProfile(raw, host))
    .filter((profile) => profile.key.id !== "");
  return {
    items,
    olderCursor: items.length ? String(page + 1) : undefined,
    endReached: !items.length,
  };
}

/* -------------------------------------------------------------------------- */
/* Credential                                                                 */
/* -------------------------------------------------------------------------- */

function isCredential(value: unknown): value is CoolapkCredential {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const credential = value as Record<string, unknown>;
  return typeof credential.deviceId === "string" && credential.deviceId.length > 0 && Array.isArray(credential.users);
}

async function readCredential(): Promise<CoolapkCredential> {
  const value = await flare.credential.read();
  if (!isCredential(value)) fail("AuthenticationRequired", "匿名身份已失效，请重新添加酷安账号");
  const users: FollowedUser[] = [];
  const rawUsers = value.users as unknown[];
  for (const raw of rawUsers) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const uid = String(entry.uid ?? "");
    if (!uid) continue;
    users.push({
      uid,
      username: String(entry.username ?? uid),
      avatar: typeof entry.avatar === "string" ? entry.avatar : undefined,
      lastAt: typeof entry.lastAt === "number" ? entry.lastAt : 0,
    });
  }
  return { deviceId: value.deviceId, users };
}

/** 用 Cookie 让服务端确认登录身份：返回 uid / 用户名 / 头像，未登录返回 null。 */
async function fetchLoginInfo(
  credential: CoolapkCredential,
  cookiePairs: { name: string; value: string }[],
): Promise<{ uid: string; username?: string; avatar?: string } | null> {
  const body = await apiGetWithCookies(credential, "/v6/account/checkLoginInfo", {}, cookiePairs);
  const data = (body.data ?? null) as Record<string, unknown> | null;
  if (!data) return null;
  const uid = String(data.uid ?? "").trim();
  if (!/^\d+$/.test(uid)) return null;
  return {
    uid,
    username: String(data.username ?? "").trim() || undefined,
    avatar: toHttps(String(data.userAvatar ?? "")),
  };
}

/* -------------------------------------------------------------------------- */
/* Login helpers                                                              */
/* -------------------------------------------------------------------------- */

function anonymousProfile(context: PluginInvocationContextV1, note?: string): ProfileV1 {
  return {
    key: { id: ANONYMOUS_ACCOUNT_ID, host: accountHost(context) },
    handle: "coolapk",
    displayName: note ? `酷安｜${note}` : "酷安匿名",
    description: { format: "plain", value: "只读浏览：不登录，关注名单保存在本地" },
  };
}

/** 读取当前账号里已经导入的关注，避免诊断账号把已有的本地关注清空。 */
async function readExistingUsers(): Promise<FollowedUser[]> {
  try {
    const value = await flare.credential.read();
    if (isCredential(value)) return value.users;
  } catch {
    // 登录过程中还没有落库的凭证，忽略。
  }
  return [];
}

/**
 * 导入卡住时不再无限转圈：直接把这一步的结论写进账号名（如「酷安｜WebView 没交 Cookie」），
 * 关掉 WebView 并落地一个匿名账号，让人在账号列表里就能看到卡在哪。
 */
async function diagnosticSuccess(
  context: PluginInvocationContextV1,
  deviceId: string,
  note: string,
): Promise<{ type: "success"; value: any }> {
  const users = await readExistingUsers();
  return {
    type: "success",
    value: {
      accountId: DIAGNOSTIC_ACCOUNT_ID,
      origin: context.origin,
      credential: { deviceId, users, note } as unknown as JsonValue,
      profile: diagnosticProfile(context, note),
      capabilities: CAPABILITIES,
    } as unknown as JsonValue,
  };
}

function diagnosticProfile(context: PluginInvocationContextV1, note: string): ProfileV1 {
  return {
    key: { id: DIAGNOSTIC_ACCOUNT_ID, host: accountHost(context) },
    handle: "coolapk",
    displayName: `酷安｜${note}`,
    description: { format: "plain", value: note },
  };
}

async function importFollowing(
  credential: CoolapkCredential,
  uid: string,
  cookiePairs: { name: string; value: string }[],
): Promise<FollowedUser[]> {
  const users: FollowedUser[] = [];
  const seen = new Set<string>();
  let lastItem: string | undefined;
  for (let page = 1; page <= IMPORT_PAGE_LIMIT; page++) {
    // 酷安翻页要同时带 page 和 lastItem（上一页最后一条的 id）。
    const body = await apiGetWithCookies(
      credential,
      "/v6/user/followList",
      { uid, page, lastItem },
      cookiePairs,
    );
    const rows = asArray(body.data);
    if (!rows.length) break;
    const tail = rows[rows.length - 1];
    const nextLastItem = String(tail?.id ?? "").trim();
    if (!nextLastItem || nextLastItem === lastItem) break;
    lastItem = nextLastItem;
    for (const raw of rows) {
      const entry = raw as Record<string, unknown>;
      const id = String(entry.uid ?? "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      users.push({
        uid: id,
        username: String(entry.username ?? id),
        avatar: toHttps(String(entry.userAvatar ?? entry.avatar ?? "")),
        lastAt: 0,
      });
      if (users.length >= IMPORT_USER_LIMIT) return users;
    }
  }
  return users;
}

/* -------------------------------------------------------------------------- */
/* HTTP helpers                                                               */
/* -------------------------------------------------------------------------- */

async function apiGetWithCookies(
  credential: CoolapkCredential,
  path: string,
  params: Record<string, string | number | undefined>,
  cookiePairs: { name: string; value: string }[],
): Promise<{ data?: unknown }> {
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
  const url = `${API_ORIGIN}${path}?${query}`;
  let response: HttpResponseV1;
  try {
    response = await flare.http.request({
      url,
      headers: accountHeaders(credential),
      cookies: cookiePairs,
      timeoutMillis: 15000,
    });
  } catch {
    fail("Network", "酷安接口连接失败，请检查网络");
  }
  if (response.status === 403) fail("Unsupported", "酷安拒绝了该请求，无法导入关注列表");
  if (response.status < 200 || response.status >= 300) {
    fail("Remote", `酷安接口返回 ${response.status}，无法导入关注列表`);
  }
  try {
    return JSON.parse(response.body) as { data?: unknown };
  } catch {
    fail("InvalidResponse", "酷安返回了非 JSON 内容");
  }
}

/* -------------------------------------------------------------------------- */
/* Mapping                                                                    */
/* -------------------------------------------------------------------------- */

async function fetchProfile(
  credential: CoolapkCredential,
  uid: string,
  context: PluginInvocationContextV1,
  cookiePairs?: { name: string; value: string }[],
): Promise<ProfileV1> {
  const body = cookiePairs
    ? await apiGetWithCookies(credential, "/v6/user/space", { uid }, cookiePairs)
    : await apiGet(credential, "/v6/user/space", { uid });
  const raw = (body.data ?? {}) as Record<string, unknown>;
  if (!raw || typeof raw !== "object" || !raw.uid) fail("NotFound", "酷安用户不存在或已被封禁");
  return mapProfile(raw, accountHost(context));
}

function mapProfile(raw: Record<string, unknown>, host: string): ProfileV1 {
  const uid = String(raw.uid ?? "");
  const username = String(raw.displayUsername ?? raw.username ?? uid);
  const bio = String(raw.bio ?? "").trim();
  const verify = String(raw.verify_title ?? "").trim();
  return {
    key: { id: uid, host },
    handle: username || uid,
    displayName: username || uid,
    avatarUrl: toHttps(String(raw.userAvatar ?? raw.avatar ?? "")),
    bannerUrl: toHttps(String(raw.cover ?? "")),
    description: bio ? { format: "plain", value: bio } : undefined,
    url: `${WEB_ORIGIN}/u/${uid}`,
    followersCount: numberOrUndefined(raw.fans),
    followingCount: numberOrUndefined(raw.follow),
    postsCount: numberOrUndefined(raw.feed),
    fields: verify ? [{ name: "认证", value: { format: "plain", value: verify } }] : undefined,
  };
}

function mapPost(raw: Record<string, unknown>, host: string): PostV1 | null {
  const id = String(raw.id ?? "");
  if (!id) return null;
  const uid = String(raw.uid ?? "");
  const username = String(raw.username ?? "");
  const message = String(raw.message ?? "").trim();
  const media = mapMedia(raw, id);
  const topicTitle = String(raw.ttitle ?? "").trim();
  const topicUrl = String(raw.turl ?? "").trim();
  return {
    key: { id, host },
    author: {
      key: { id: uid, host },
      handle: username || uid,
      displayName: username || uid,
      avatarUrl: toHttps(String(raw.userAvatar ?? "")),
      url: `${WEB_ORIGIN}/u/${uid}`,
    },
    createdAt: toDate(raw.dateline),
    content: message
      ? { format: "html", value: message }
      : { format: "plain", value: media.length ? "（无正文）" : "（空动态）" },
    media: media.length ? media : undefined,
    url: `${WEB_ORIGIN}/feed/${id}`,
    // 详情/回复接口需要验证码，这里统一跳到网页版阅读。
    detailType: "link",
    favouritesCount: numberOrUndefined(raw.likenum),
    repliesCount: numberOrUndefined(raw.replynum),
    repostsCount: numberOrUndefined(raw.forwardnum),
    sourceChannel: topicTitle
      ? { id: topicUrl || `topic-${String(raw.tid ?? "")}`, name: topicTitle }
      : undefined,
  };
}

/** 转发动态把原帖放进 presentation.repost，让 Flare 用原生引用卡片渲染。 */
function toTimelineItem(raw: Record<string, unknown>, host: string): TimelineItemV1 | null {
  const post = mapPost(raw, host);
  if (!post) return null;
  const source = raw.sourceFeed as Record<string, unknown> | undefined;
  if (source && typeof source === "object" && source.id) {
    const quoted = mapPost(source, host);
    if (quoted) return { type: "post", post, presentation: { repost: quoted } };
  }
  return { type: "post", post };
}

/** 图床只认浏览器 UA：v2 由媒体自带请求头解决，v1 只能走图片代理。 */
function mediaUrl(url: string): string | undefined {
  const https = toHttps(url);
  if (!https) return;
  return __IMAGE_PROXY__ ? `${__IMAGE_PROXY__}${encodeURIComponent(https)}` : https;
}

function mediaHeaders(): Record<string, string> | undefined {
  return __V2__ ? { "User-Agent": MEDIA_USER_AGENT } : undefined;
}

function mapMedia(raw: Record<string, unknown>, postId: string): MediaV1[] {
  const media: MediaV1[] = [];
  const headerPart = mediaHeaders() ? { customHeaders: mediaHeaders() } : {};
  const videoUrl = mediaUrl(String(raw.media_url ?? ""));
  if (Number(raw.media_type) === 2 && videoUrl) {
    media.push({
      id: `${postId}-video`,
      type: "video",
      url: videoUrl,
      previewUrl: mediaUrl(String(raw.media_pic ?? "")),
      ...headerPart,
    });
  }
  const pictures: string[] = [];
  for (const entry of asArray(raw.picArr)) {
    if (typeof entry === "string" && entry) pictures.push(entry);
  }
  if (!pictures.length) {
    const single = String(raw.pic ?? "").trim();
    if (single) pictures.push(...single.split(",").map((part) => part.trim()).filter(Boolean));
  }
  pictures.slice(0, 9).forEach((url, index) => {
    const proxied = mediaUrl(url);
    if (!proxied) return;
    media.push({
      id: `${postId}-${index}`,
      type: "image",
      url: proxied,
      ...headerPart,
    });
  });
  return media;
}

/* -------------------------------------------------------------------------- */
/* Utilities                                                                  */
/* -------------------------------------------------------------------------- */

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function toHttps(url: string): string | undefined {
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  const absolute = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
  if (absolute.startsWith("http://")) return `https://${absolute.slice("http://".length)}`;
  return absolute.startsWith("https://") ? absolute : undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toDate(value: unknown): string {
  const seconds = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return new Date().toISOString();
  return new Date(seconds * 1000).toISOString();
}

function pageNumber(cursor: string | undefined): number {
  const parsed = Number.parseInt(cursor ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function compareCreatedAt(left: TimelineItemV1, right: TimelineItemV1): number {
  const leftTime = left.type === "post" ? left.post.createdAt : "";
  const rightTime = right.type === "post" ? right.post.createdAt : "";
  return rightTime.localeCompare(leftTime);
}

/** 把浏览器复制的 "a=1; b=2" 解析成结构化 Cookie。 */
function parseCookieHeader(raw: string): { name: string; value: string }[] {
  const pairs: { name: string; value: string }[] = [];
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const name = trimmed.slice(0, index).trim();
    const value = cleanCookie(trimmed.slice(index + 1));
    if (name && value) pairs.push({ name, value });
  }
  return pairs;
}

/** Cookie 值可能带引号或 URL 编码，统一取干净值。 */
function cleanCookie(value: string | undefined): string {
  if (!value) return "";
  const stripped = value.trim().replace(/^"|"$/g, "");
  if (!stripped || /^deleted$/i.test(stripped)) return "";
  try {
    return decodeURIComponent(stripped);
  } catch {
    return stripped;
  }
}

function hostOf(origin: string): string {
  return origin.replace(/^https:\/\//, "").replace(/\/.*$/, "");
}

function accountHost(context: PluginInvocationContextV1): string {
  const host = context.origin.replace(/^https:\/\//, "").replace(/\/.*$/, "");
  // API v1 hosts approve only the account origin, so the instance must be the API host.
  if (!__V2__ && host !== V1_API_HOST) {
    fail("Validation", `实例地址请填 ${V1_API_HOST}（当前版本只允许插件访问这一个域名）`);
  }
  return host;
}

function parseActionToken(token: string | undefined): { username?: string; avatar?: string } | null {
  if (!token) return null;
  try {
    const value = JSON.parse(token) as Record<string, unknown>;
    return {
      username: typeof value.username === "string" ? value.username : undefined,
      avatar: typeof value.avatar === "string" ? value.avatar : undefined,
    };
  } catch {
    return null;
  }
}

function fail(code: PluginErrorCodeV1, message: string): never {
  throw flare.error({ code, message: { value: message } });
}
