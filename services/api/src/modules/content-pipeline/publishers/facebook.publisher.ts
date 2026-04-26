import type { ChannelPublisher, PublishAdapterInput, PublishAdapterResult } from "./types";

/** Заглушка: интеграция Facebook будет подключена через page access token. */
export function createFacebookPublisher(): ChannelPublisher {
  return {
    channel: "facebook",
    async publish(input: PublishAdapterInput): Promise<PublishAdapterResult> {
      return {
        externalId: `facebook_stub:${input.draft.id}`,
        url: null,
        raw: { warning: "facebook publisher stub" },
      };
    },
  };
}

