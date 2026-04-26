type CollectionPageProps = {
  name: string;
  description: string;
  url: string;
  image?: string;
};

export function CollectionPageJsonLd({ name, description, url, image }: CollectionPageProps) {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    description: description.slice(0, 5000),
    inLanguage: "ru-RU",
    url,
  };
  if (image?.trim()) {
    data.image = image.trim();
  }
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
