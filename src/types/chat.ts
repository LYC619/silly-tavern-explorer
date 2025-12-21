export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  name?: string;
  timestamp?: number;
}

export interface CharacterInfo {
  name: string;
  avatar?: string;
  color?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  character: CharacterInfo;
  user: CharacterInfo;
  createdAt: number;
}

export type ThemeStyle = 'novel' | 'social' | 'minimal' | 'elegant';

export interface ExportSettings {
  theme: ThemeStyle;
  showTimestamp: boolean;
  showAvatar: boolean;
  paperWidth: number;
  fontSize: number;
}
