export interface RelatedPerson {
  name: string;
  relationship: string; // e.g., "Colleague", "Boss", "Friend"
}

export interface Contact {
  id: string;
  name: string;
  title: string;
  company: string;
  email?: string;
  phone?: string;
  location?: string;
  tags: string[];
  summary: string; // AI generated bio
  notes: string; // User notes or extra details
  relatedPeople: RelatedPerson[]; // Inferred potential connections
  avatarUrl?: string; // Placeholder
}

export interface SearchResult {
  title: string;
  snippet: string;
  url?: string;
  source: string;
}

export enum ViewMode {
  LIST = 'LIST',
  GRAPH = 'GRAPH'
}