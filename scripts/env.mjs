const truthy = (value) => value === '1';

export function isNetworkRestricted(env = process.env) {
  if (truthy(env.PLAYBOOK_NO_NETWORK)) return true;

  if (env.CI && truthy(env.PLAYBOOK_NO_NETWORK)) return true;

  const hasProxy = Boolean(env.HTTPS_PROXY || env.HTTP_PROXY);
  if (hasProxy && truthy(env.PLAYBOOK_STRICT_PROXY)) return true;

  return false;
}
