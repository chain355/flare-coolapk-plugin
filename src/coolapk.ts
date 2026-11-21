/** Coolapk device identity, request signing (TokenV3) and the small read-only API surface. */
import { bcryptHash } from "./bcrypt";
import { base64DecodeBytes, base64DecodeText, base64Encode, base64NoPadding } from "./bytes";
import { md5 } from "./md5";

export const PLATFORM_HOST = "coolapk.com";
export const API_ORIGIN = "https://api.coolapk.com";
export const WEB_ORIGIN = "https://www.coolapk.com";
export const LOGIN_URL = "https://account.coolapk.com/auth/login?type=mobile";

const APP_ID = "com.coolapk.market";
const VERSION_NAME = "16.7.0";
const VERSION_CODE = "2610291";
const API_VERSION = "16";
const SDK_INT = "34";
const ANDROID_VERSION = "14";
const MODEL = "Pixel 7";
const BUILD_NUMBER = "TQ3A.230901.001";
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Media CDN rejects non-browser agents, so every image carries this header. */
export const MEDIA_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

const LOOKUP_B64 =
  "VFRCVU9GUXNRMEVsTFVNa1dERWpRU0VzVXlFbUxETkFVeTFEUEZZdUl5MGlNVU01SXpCVUpGY3RNeWtoTVVRMUpTMURPU1V4TXpoUUxWTXdWMDBzSXloU01UUXNXVEZEUkZFd1EwUlZNU1FrVVMwaktTTXRKRGhZTFZRa1VqRXpLU1FzTTBCVkxUUXdVaTAwTlNNc00yQlhMVk1sSkMxRE5GbE5MQ1EwV1RFekxTUXhRMEVoTEVNbElqRXpLRmN3TXowbExpTkVWekVqUFNZdU5Ea2tMRk13Vml4VEtGa3RRemhYTEZNc1dDNGpMU1l0VTJCVFRUQTBMRkV1TXpoVExqTWhJakZETUZNc0kwQlZMQ1FrVUN3ekpTSXNJekJTTUVNOFVDeEVMU0l0STJCUUxVUW9VeTBqTEZNc0l5VWtNRlF3VmswdFJDeFlNVE1sSkM0ME5TRXdVMFJRTEZNaElpMGtOU013VTJCUUxqTmdVeXdqT0ZFc05DeFRMRU13V0N4VUxTRXRJeVJUTEROQkl5MDBKRlpOTVVNc1VEQkVKRmd0TkMwa0xEUWtXQzFETUZNeFJDa2pMVk0wVml4VE1GZ3hJeTBtTFZNeEpTMHpKRlF4TTJCUUxTUTRXVEJETUZNdUkwVWhUU3d6UEZndFJEQlJNRE5FVVMwak9GWXVKRGtsTVNRMFV6QXpOU013UkRra01UTWtWU3hVTUZRdFJDeFlNVE5GSXl4RUxGWXNJelVoTGlRMFYwMHhOQ3hWTENNMFZ5NHpKRlV4TkN4VExGUTRWeTRqWUZZeEpEVWpMVU13VXpGRFBGSXNNMEVsTERNc1ZEQTBPU011TkNrbUxFUWtWaXhFTVNKTkxUTW9VaXd6TEZjdFUwUlFMaVF3VlRGREpTVXdVeWtqTVVNaEl5MHpJU1VzSTBFak1UTXdVUzFVTkZjeFJERWxMVVF0SlM0a05GSXNJemhaVFRCVFlGRXdReVJZTFNNbElTNDBMRmdzVkRSWkxVUW9XVEJEUUZZdFJDeFdMak5FVkRCRE1Ga3RORFVsTEZRNFZTMVVKRmd3TXpSV0xEUTRVVTB3UXkwbUxVUTRXUzFUTVNNc1V5VWlNVU5BVVN4VUxGWXVJMFJVTGlNc1dERkVMRk14STJCUUxWTTBXUzRrT0Zjd00wUlhMVk1vV0MwaktGRXhMQ00wVml4VE5GQXRSRFJXTFVRbEpDMVRKRkF3TkN4Z1lB";

const lookup = base64DecodeBytes(LOOKUP_B64);

export interface FollowedUser {
  uid: string;
  username: string;
  avatar?: string;
  /** Epoch millis of the last successful refresh; drives the rotation order. */
  lastAt?: number;
}

export interface CoolapkCredential {
  deviceId: string;
  users: FollowedUser[];
  /** 只在导入失败时写入，用来在账号列表里显示导入卡在哪一步。 */
  note?: string;
}

/** `deviceId; ; ; ; vendor; brand; model; build; null`, base64 encoded, padding stripped and reversed. */
export function deviceHeader(deviceId: string): string {
  const raw = `${deviceId}; ; ; ; Google; google; ${MODEL}; ${BUILD_NUMBER}; null`;
  return base64NoPadding(raw).split("").reverse().join("");
}

function userAgent(): string {
  return (
    `Dalvik/2.1.0 (Linux; U; Android ${ANDROID_VERSION}; ${MODEL} ${BUILD_NUMBER})` +
    ` (#Build; google; ${MODEL}; ${BUILD_NUMBER}; ${ANDROID_VERSION})` +
    ` +CoolMarket/${VERSION_NAME}-${VERSION_CODE}-universal`
  );
}

/** X-App-Token = base64(bcrypt(cost 4, $2y, salt derived from time + payload) prefixed with "v3"). */
export function tokenV3(device: string, appCode: string, timestampSeconds: number): string {
  return __tokenV3(device, appCode, timestampSeconds).token;
}

export function __tokenV3(device: string, appCode: string, timestampSeconds: number): { token: string; salt: string; offset: number } {
  const code = Number.parseInt(appCode, 10) || 2610291;
  for (let offset = 0; offset <= 15; offset++) {
    const time = timestampSeconds + offset;
    const index = (((time + code) % 100) + 100) % 100 * 4 + 0x80;
    const slice = lookup.subarray(index, index + 0x80);
    let encoded = "";
    for (let i = 0; i < slice.length; i++) encoded += String.fromCharCode(slice[i]);
    const segment = base64DecodeText(encoded);
    const plain = `com.coolapk.market&${segment}&${md5(device)}&${time}&${code}`;
    const password = md5(base64Encode(plain));
    const source = base64NoPadding(`${time.toString(16)}/${md5(plain)}`).slice(0, 22);
    const lastIndex = (ALPHABET.indexOf(source[21]) - 5 + 64) % 64;
    const salt = source.slice(0, 21) + ALPHABET[lastIndex];
    if (!/^[./A-Za-z0-9]{22}$/.test(salt)) continue;
    const hash = `$2y${bcryptHash(password, 4, salt).slice(3)}`;
    return { token: `v3${base64NoPadding(hash)}`, salt, offset };
  }
  throw new Error("coolapk token unavailable");
}

export function accountHeaders(credential: CoolapkCredential): Record<string, string> {
  const device = deviceHeader(credential.deviceId);
  const seconds = Math.floor(Date.now() / 1000);
  return {
    "User-Agent": userAgent(),
    "X-Requested-With": "XMLHttpRequest",
    "X-Sdk-Int": SDK_INT,
    "X-Sdk-Locale": "zh-CN",
    "X-App-Id": APP_ID,
    "X-App-Token": tokenV3(device, VERSION_CODE, seconds),
    "X-App-Version": VERSION_NAME,
    "X-App-Code": VERSION_CODE,
    "X-Api-Version": API_VERSION,
    "X-App-Device": device,
    "X-Dark-Mode": "0",
    "X-App-Channel": "coolapk",
    "X-App-Mode": "universal",
    "X-App-Supported": VERSION_CODE,
  };
}

function queryString(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

export interface CoolapkEnvelope {
  data?: unknown;
  message?: string;
  messageStatus?: string;
  status?: number;
  code?: number;
}

/** GET a Coolapk JSON endpoint. Throws typed errors for HTTP and payload failures. */
export async function apiGet(
  credential: CoolapkCredential,
  path: string,
  params: Record<string, string | number | undefined>,
  options: { timeoutMillis?: number } = {},
): Promise<CoolapkEnvelope> {
  const url = `${API_ORIGIN}${path}${queryString(params)}`;
  let response: HttpResponseV1;
  try {
    response = await flare.http.request({
      url,
      headers: accountHeaders(credential),
      timeoutMillis: options.timeoutMillis ?? 15000,
    });
  } catch {
    throw flare.error({ code: "Network", message: { value: "酷安接口连接失败，请检查网络" } });
  }
  let body: CoolapkEnvelope;
  try {
    body = JSON.parse(response.body) as CoolapkEnvelope;
  } catch {
    throw flare.error({ code: "InvalidResponse", message: { value: "酷安返回了非 JSON 内容" } });
  }
  if (response.status === 403 || body.messageStatus === "err_request_captcha_v2") {
    throw flare.error({ code: "Unsupported", message: { value: "该接口需要验证码，匿名浏览不可用" } });
  }
  if (response.status === 401) {
    throw flare.error({ code: "AuthenticationRequired", message: { value: "酷安拒绝了当前凭证" } });
  }
  if (response.status === 429) {
    throw flare.error({ code: "RateLimited", message: { value: "请求过于频繁，请稍后再试" }, retryAfterSeconds: 30 });
  }
  if (response.status < 200 || response.status >= 300) {
    throw flare.error({
      code: "Remote",
      message: { value: body.message || `酷安接口返回 ${response.status}` },
    });
  }
  return body;
}

/** Feed page of one user. `cursor` is the previous page's oldest feed id. */
export async function fetchUserFeed(
  credential: CoolapkCredential,
  uid: string,
  options: { page?: number; cursor?: string | null; limit?: number; includeTop?: boolean } = {},
): Promise<Record<string, unknown>[]> {
  const body = await apiGet(credential, "/v6/user/feedList", {
    uid,
    page: options.page ?? 1,
    lastItem: options.cursor ?? undefined,
    isIncludeTop: options.includeTop ? 1 : 0,
    showAnonymous: 0,
    showDoing: 0,
  });
  const data = Array.isArray(body.data) ? body.data : [];
  return data.slice(0, options.limit ?? data.length) as Record<string, unknown>[];
}
