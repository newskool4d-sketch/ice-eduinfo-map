import { get } from "node:https";

/** Bounded HTTP/1.1 requests without connection reuse.
 * Use one HTTP/1.1 connection per page, sharing the caller's overall deadline.
 * No redirects: credentials must never be forwarded to another host.
 */
export function fetchVworldPage(url: string, init?: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = get(url, {
      agent: false,
      signal: init?.signal ?? undefined,
      headers: { Accept: "application/json", "Accept-Encoding": "identity", ...(init?.headers as Record<string, string> | undefined) },
    }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        const status = response.statusCode ?? 502;
        resolve(new Response(null, { status: status >= 200 && status <= 599 ? status : 502 }));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 16 * 1024 * 1024) { response.destroy(new Error("Building page exceeds size limit")); return; }
        chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("aborted", () => reject(new Error("Building source connection closed")));
      response.on("end", () => resolve(new Response(Buffer.concat(chunks).toString("utf8"), { status: response.statusCode ?? 502 })));
    });
    request.on("error", reject);
  });
}
