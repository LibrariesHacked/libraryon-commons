export const origin = "https://libraryon.org";
export const assetHost = "libraryon.lon1.digitaloceanspaces.com";

export function allowed(url, api = false) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password)
    return false;
  if (parsed.hostname === assetHost) return true;
  if (parsed.hostname === "lon1.digitaloceanspaces.com")
    return parsed.pathname.startsWith("/libraryon/");
  if (parsed.origin !== origin) return false;
  const pathname = decodeURIComponent(parsed.pathname);
  return (
    !pathname.startsWith("/cms/") || (api && pathname.startsWith("/cms/api/"))
  );
}
