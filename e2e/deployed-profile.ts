import type { APIRequestContext } from "@playwright/test";

/**
 * Which profile a deployed site serves, read from the remote page itself (the
 * local ACTIVE_PROFILE says nothing about DEPLOYMENT_URL). The Incheon build's
 * <title> is "인천 교육지도"; every other profile is treated as Jeonbuk.
 */
export async function deployedProfile(request: APIRequestContext, site: string): Promise<"incheon" | "jeonbuk"> {
  const html = await (await request.get(`${site}/`)).text();
  return /<title>인천 교육지도<\/title>/.test(html) ? "incheon" : "jeonbuk";
}
