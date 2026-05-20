import type {
  Article,
  Destination,
  ImageAnalyzeResponse,
  MediaImage,
  Place,
  SearchResult
} from "@travelassistant/shared";

import { createApiClient } from "./api-client";

export function createContentClient(accessToken?: string) {
  const client = createApiClient({ accessToken });

  return {
    listDestinations(): Promise<Destination[]> {
      return client.get<Destination[]>("/destinations");
    },
    getDestination(slug: string): Promise<Destination> {
      return client.get<Destination>(`/destinations/${slug}`);
    },
    listPlaces(slug: string): Promise<Place[]> {
      return client.get<Place[]>(`/destinations/${slug}/places`);
    },
    listFoods(slug: string): Promise<Place[]> {
      return client.get<Place[]>(`/destinations/${slug}/foods`);
    },
    listHotels(slug: string): Promise<Place[]> {
      return client.get<Place[]>(`/destinations/${slug}/hotels`);
    },
    listArticles(): Promise<Article[]> {
      return client.get<Article[]>("/articles");
    },
    getArticle(slug: string): Promise<Article> {
      return client.get<Article>(`/articles/${slug}`);
    },
    search(query: string): Promise<SearchResult[]> {
      return client.get<SearchResult[]>(`/search?q=${encodeURIComponent(query)}`);
    },
    getImage(imageId: string): Promise<MediaImage> {
      return client.get<MediaImage>(`/images/${imageId}`);
    },
    uploadImage(file: File, altText?: string): Promise<MediaImage> {
      const formData = new FormData();
      formData.set("file", file);
      if (altText) {
        formData.set("alt_text", altText);
      }
      return client.postForm<MediaImage>("/images/upload", formData);
    },
    analyzeImage(imageId: string): Promise<ImageAnalyzeResponse> {
      return client.post<ImageAnalyzeResponse>("/images/analyze", { image_id: imageId });
    }
  };
}
