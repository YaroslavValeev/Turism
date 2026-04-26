import type { ChannelPublisher, PublishAdapterInput, PublishAdapterResult } from "./types";

/** Заглушка: интеграция VK будет подключена через токены/owner_id. */
export function createVkPublisher(): ChannelPublisher {
  return {
    channel: "vk",
    async publish(input: PublishAdapterInput): Promise<PublishAdapterResult> {
      return {
        externalId: `vk_stub:${input.draft.id}`,
        url: null,
        raw: { warning: "vk publisher stub" },
      };
    },
  };
}

