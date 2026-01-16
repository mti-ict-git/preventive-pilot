import { Client } from "ldapts";
import { env } from "../config/env.js";

const escapeFilterValue = (value: string) =>
  value.replace(/[\\()*\0]/g, (ch) => {
    const map: Record<string, string> = {
      "\\": "\\5c",
      "*": "\\2a",
      "(": "\\28",
      ")": "\\29",
      "\0": "\\00",
    };
    return map[ch] ?? ch;
  });

const normalizeLoginIdentifier = (identifier: string): { raw: string; username: string } => {
  const trimmed = identifier.trim();
  const withoutDomain = trimmed.includes("\\") ? trimmed.split("\\").pop() ?? trimmed : trimmed;
  const username = withoutDomain.includes("@")
    ? withoutDomain.slice(0, Math.max(0, withoutDomain.indexOf("@")))
    : withoutDomain;
  return { raw: withoutDomain, username };
};

const buildUserSearchFilter = (identifier: string): string => {
  const normalized = normalizeLoginIdentifier(identifier);
  const base = env.LDAP_USER_SEARCH_FILTER.replace(
    "{username}",
    escapeFilterValue(normalized.username),
  );

  if (normalized.raw.includes("@")) {
    const escaped = escapeFilterValue(normalized.raw);
    return `(|${base}(mail=${escaped})(userPrincipalName=${escaped}))`;
  }

  return base;
};

const pickLdapString = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item !== "string") continue;
      const trimmed = item.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
};

export interface LdapUserProfile {
  username: string;
  dn: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  isSuperadmin: boolean;
}

const createClient = () =>
  new Client({
    url: env.LDAP_URL,
    timeout: env.LDAP_TIMEOUT,
    connectTimeout: env.LDAP_CONNECT_TIMEOUT,
    tlsOptions: {
      rejectUnauthorized: env.LDAP_TLS_REJECT_UNAUTHORIZED,
    },
  });

export const authenticateWithLdap = async (
  identifier: string,
  password: string,
): Promise<LdapUserProfile> => {
  const normalized = normalizeLoginIdentifier(identifier);
  const searchClient = createClient();
  try {
    await searchClient.bind(env.LDAP_BIND_DN, env.LDAP_BIND_PASSWORD);

    const filter = buildUserSearchFilter(normalized.raw);

    const userSearch = await searchClient.search(env.LDAP_USER_SEARCH_BASE, {
      scope: "sub",
      filter,
      attributes: ["cn", "displayName", "mail", "mobile", "telephoneNumber", "ipPhone", "homePhone", "otherMobile", "memberOf"],
    });

    const userEntry = userSearch.searchEntries[0];
    if (!userEntry || typeof userEntry.dn !== "string") {
      throw new Error("Invalid username or password");
    }

    const userDn = userEntry.dn;

    const authClient = createClient();
    try {
      await authClient.bind(userDn, password);
    } finally {
      await authClient.unbind().catch(() => undefined);
    }

    const groupFilter = `(&(objectClass=group)(distinguishedName=${escapeFilterValue(env.LDAP_GROUP_SUPERADMIN)})(member=${escapeFilterValue(userDn)}))`;
    const groupSearch = await searchClient.search(env.LDAP_GROUP_SEARCH_BASE, {
      scope: "sub",
      filter: groupFilter,
      attributes: ["distinguishedName"],
    });

    const isSuperadmin = groupSearch.searchEntries.length > 0;

    const displayName =
      (typeof userEntry.displayName === "string" && userEntry.displayName) ||
      (typeof userEntry.cn === "string" && userEntry.cn) ||
      null;

    const entry = userEntry as unknown as Record<string, unknown>;
    const email = pickLdapString(entry.mail);
    const phone =
      pickLdapString(entry.mobile) ??
      pickLdapString(entry.telephoneNumber) ??
      pickLdapString(entry.ipPhone) ??
      pickLdapString(entry.homePhone) ??
      pickLdapString(entry.otherMobile);

    return {
      username: normalized.username,
      dn: userDn,
      displayName,
      email,
      phone,
      isSuperadmin,
    };
  } finally {
    await searchClient.unbind().catch(() => undefined);
  }
};

export const lookupLdapUser = async (identifier: string): Promise<LdapUserProfile> => {
  const normalized = normalizeLoginIdentifier(identifier);
  const searchClient = createClient();
  try {
    await searchClient.bind(env.LDAP_BIND_DN, env.LDAP_BIND_PASSWORD);

    const filter = buildUserSearchFilter(normalized.raw);
    const userSearch = await searchClient.search(env.LDAP_USER_SEARCH_BASE, {
      scope: "sub",
      filter,
      attributes: ["cn", "displayName", "mail", "mobile", "telephoneNumber", "ipPhone", "homePhone", "otherMobile", "memberOf"],
    });

    const userEntry = userSearch.searchEntries[0];
    if (!userEntry || typeof userEntry.dn !== "string") {
      throw new Error("User not found");
    }

    const userDn = userEntry.dn;

    const groupFilter = `(&(objectClass=group)(distinguishedName=${escapeFilterValue(env.LDAP_GROUP_SUPERADMIN)})(member=${escapeFilterValue(userDn)}))`;
    const groupSearch = await searchClient.search(env.LDAP_GROUP_SEARCH_BASE, {
      scope: "sub",
      filter: groupFilter,
      attributes: ["distinguishedName"],
    });

    const isSuperadmin = groupSearch.searchEntries.length > 0;

    const displayName =
      (typeof userEntry.displayName === "string" && userEntry.displayName) ||
      (typeof userEntry.cn === "string" && userEntry.cn) ||
      null;

    const entry = userEntry as unknown as Record<string, unknown>;
    const email = pickLdapString(entry.mail);
    const phone =
      pickLdapString(entry.mobile) ??
      pickLdapString(entry.telephoneNumber) ??
      pickLdapString(entry.ipPhone) ??
      pickLdapString(entry.homePhone) ??
      pickLdapString(entry.otherMobile);

    return {
      username: normalized.username,
      dn: userDn,
      displayName,
      email,
      phone,
      isSuperadmin,
    };
  } finally {
    await searchClient.unbind().catch(() => undefined);
  }
};

export type LdapUserSearchItem = {
  username: string;
  dn: string;
  displayName: string | null;
  email: string | null;
  upn: string | null;
};

export const searchLdapUsers = async (query: string, limit = 10): Promise<LdapUserSearchItem[]> => {
  const normalized = normalizeLoginIdentifier(query);
  const searchClient = createClient();
  try {
    await searchClient.bind(env.LDAP_BIND_DN, env.LDAP_BIND_PASSWORD);

    const escapedUser = escapeFilterValue(normalized.username);
    const escapedRaw = escapeFilterValue(normalized.raw);
    const userClass = "(objectClass=user)";
    const filter = `(&${userClass}(|(sAMAccountName=*${escapedUser}*)(cn=*${escapedUser}*)(displayName=*${escapedUser}*)(name=*${escapedUser}*)(givenName=*${escapedUser}*)(sn=*${escapedUser}*)(mail=*${escapedRaw}*)(userPrincipalName=*${escapedRaw}*)))`;

    const result = await searchClient.search(env.LDAP_USER_SEARCH_BASE, {
      scope: "sub",
      filter,
      attributes: ["sAMAccountName", "displayName", "cn", "name", "givenName", "sn", "mail", "userPrincipalName"],
      sizeLimit: limit,
    });

    const items: LdapUserSearchItem[] = result.searchEntries.map((entry) => {
      const raw = entry as Record<string, unknown>;
      const dn = typeof entry.dn === "string" ? entry.dn : "";
      const sam = raw.sAMAccountName;
      const username = typeof sam === "string" ? sam : normalized.username;
      const displayNameSource = raw.displayName ?? raw.cn;
      const displayName = typeof displayNameSource === "string" ? displayNameSource : null;
      const mailRaw = raw.mail;
      const email = typeof mailRaw === "string" ? mailRaw : null;
      const upnRaw = raw.userPrincipalName;
      const upn = typeof upnRaw === "string" ? upnRaw : null;
      return { dn, username, displayName, email, upn };
    });

    return items.slice(0, Math.max(0, limit));
  } finally {
    await searchClient.unbind().catch(() => undefined);
  }
};
