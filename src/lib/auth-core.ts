const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const AUTH_COOKIE_NAME = "wechat_ai_session";
const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 14;

export type AuthSession = {
  email: string;
  name: string;
};

type SessionPayload = AuthSession & {
  exp: number;
};

type ConfiguredUser = AuthSession & {
  password: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function encodeBase64Url(value: string) {
  const bytes = encoder.encode(value);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? 0 : 4 - (normalized.length % 4);
  const padded = normalized + "=".repeat(padding);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

  return decoder.decode(bytes);
}

async function createSigningKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign", "verify"],
  );
}

async function signValue(value: string, secret: string) {
  const key = await createSigningKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  const bytes = new Uint8Array(signature);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function readConfiguredUsers() {
  const usersFromJson = process.env.AUTH_USERS_JSON?.trim();

  if (usersFromJson) {
    try {
      const parsed = JSON.parse(usersFromJson) as Array<{
        email?: string;
        password?: string;
        name?: string;
      }>;

      return parsed
        .filter((item) => item.email && item.password)
        .map((item) => ({
          email: normalizeEmail(item.email || ""),
          password: item.password || "",
          name: item.name?.trim() || (item.email || "").split("@")[0] || "Studio User",
        })) satisfies ConfiguredUser[];
    } catch {
      return [];
    }
  }

  if (process.env.AUTH_LOGIN_EMAIL && process.env.AUTH_LOGIN_PASSWORD) {
    return [
      {
        email: normalizeEmail(process.env.AUTH_LOGIN_EMAIL),
        password: process.env.AUTH_LOGIN_PASSWORD,
        name: process.env.AUTH_LOGIN_NAME?.trim() || "Studio Owner",
      },
    ] satisfies ConfiguredUser[];
  }

  return [];
}

export function isAuthConfigured() {
  return Boolean(process.env.AUTH_SECRET?.trim()) && readConfiguredUsers().length > 0;
}

export function getAuthSetupHint() {
  return "请在环境变量里配置 AUTH_SECRET 和 AUTH_USERS_JSON，或配置 AUTH_LOGIN_EMAIL / AUTH_LOGIN_PASSWORD。";
}

export function sanitizeNextPath(nextPath: string | null | undefined) {
  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return "/studio";
  }

  return nextPath;
}

export async function createSessionToken(session: AuthSession) {
  const secret = process.env.AUTH_SECRET?.trim();

  if (!secret) {
    throw new Error("登录尚未配置完成。缺少 AUTH_SECRET。");
  }

  const payload: SessionPayload = {
    ...session,
    exp: Date.now() + AUTH_COOKIE_MAX_AGE * 1000,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = await signValue(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export async function readSessionFromToken(token: string | undefined | null) {
  const secret = process.env.AUTH_SECRET?.trim();

  if (!secret || !token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = await signValue(encodedPayload, secret);

  if (signature !== expectedSignature) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as SessionPayload;

    if (!payload.email || !payload.name || !payload.exp || payload.exp < Date.now()) {
      return null;
    }

    return {
      email: payload.email,
      name: payload.name,
    } satisfies AuthSession;
  } catch {
    return null;
  }
}

export async function authenticateUser(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const users = readConfiguredUsers();
  const matchedUser = users.find((user) => user.email === normalizedEmail);

  if (!matchedUser || matchedUser.password !== password) {
    return null;
  }

  return {
    email: matchedUser.email,
    name: matchedUser.name,
  } satisfies AuthSession;
}

export function getAuthCookieMaxAge() {
  return AUTH_COOKIE_MAX_AGE;
}
