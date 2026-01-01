import { Client } from "ldapts";
import { env } from "../config/env";

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
  username: string,
  password: string,
): Promise<LdapUserProfile> => {
  const searchClient = createClient();
  try {
    await searchClient.bind(env.LDAP_BIND_DN, env.LDAP_BIND_PASSWORD);

    const filter = env.LDAP_USER_SEARCH_FILTER.replace(
      "{username}",
      escapeFilterValue(username),
    );

    const userSearch = await searchClient.search(env.LDAP_USER_SEARCH_BASE, {
      scope: "sub",
      filter,
      attributes: ["cn", "displayName", "mail", "telephoneNumber", "memberOf"],
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

    const email = typeof userEntry.mail === "string" ? userEntry.mail : null;
    const phone = typeof userEntry.telephoneNumber === "string" ? userEntry.telephoneNumber : null;

    return {
      username,
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
