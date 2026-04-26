import type { ContentDraft, ContentPublicationChannel } from "@prisma/client";

export type PublishAdapterInput = {
  draft: ContentDraft;
  text: string;
  utmSource: string;
  utmCampaign: string;
};

export type PublishAdapterResult = {
  externalId: string;
  url?: string | null;
  raw?: unknown;
};

export interface ChannelPublisher {
  channel: ContentPublicationChannel;
  publish(input: PublishAdapterInput): Promise<PublishAdapterResult>;
}

