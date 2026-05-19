export interface Character {
  id: string;
  name: string;
  description: string;
}

export interface BrandReport {
  mission: string;
  motifs: string[];
  targetSoftware: string;
  characterDescription?: string;
  characters?: Character[];
  cinematicProfile: {
    lighting: string;
    palette: string;
    lens: string;
  };
  narrativeAnchor: string;
}

export type ShotType = "establishing" | "detail" | "glitch" | "narrative";

export interface ShotVersion {
  id: string;
  imagePreview?: string;
  audioPreview?: string;
  imagePrompt: string;
  motionPrompt: string;
  timestamp: number;
  isFavorite?: boolean;
}

export interface Shot {
  id: string;
  index: string; 
  title: string;
  type: ShotType;
  versions: ShotVersion[];
  selectedVersionId: string;
  dialogue?: string;
  promptIdeas?: string;
  notes: string;
  context: "Legacy" | "Wheelio" | "Transition";
  isCharacterShot?: boolean;
  requiresFaceSwap?: boolean;
  characterId?: string;
}

export interface Project {
  id: string;
  name: string;
  script: string;
  websiteUrl?: string;
  visualTheme?: string;
  brandReport: BrandReport | null;
  shots: Shot[];
  updatedAt: number;
}
