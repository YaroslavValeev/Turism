import { describe, expect, it } from "vitest";
import { instagramProxyForUrl, isInstagramHost } from "./instagramProxy";

const env = { INSTAGRAM_HTTP_PROXY: "socks5://172.18.0.1:1088" } as NodeJS.ProcessEnv;

describe("instagram proxy routing", () => {
  it("recognises Instagram API and CDN hosts only", () => {
    expect(isInstagramHost("www.instagram.com")).toBe(true);
    expect(isInstagramHost("scontent-waw2-1.cdninstagram.com")).toBe(true);
    expect(isInstagramHost("scontent.fbcdn.net")).toBe(true);
    expect(isInstagramHost("notinstagram.com")).toBe(false);
    expect(isInstagramHost("dawake.ru")).toBe(false);
  });

  it("routes only Instagram URLs through the configured proxy", () => {
    expect(instagramProxyForUrl("https://www.instagram.com/api/v1/users/web_profile_info/?username=da.wake", env))
      .toBe("socks5://172.18.0.1:1088");
    expect(instagramProxyForUrl("https://dawake.ru/", env)).toBeNull();
    expect(instagramProxyForUrl("not a url", env)).toBeNull();
  });

  it("keeps direct access when the proxy is not configured", () => {
    expect(instagramProxyForUrl("https://www.instagram.com/da.wake/", {} as NodeJS.ProcessEnv)).toBeNull();
  });
});
