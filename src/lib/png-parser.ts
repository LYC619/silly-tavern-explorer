/**
 * Parse SillyTavern character card data from a PNG file's tEXt chunk.
 * ST stores character data in a tEXt chunk with keyword "chara", base64-encoded JSON.
 */

export interface STCharacterCard {
  name: string;
  description?: string;
  personality?: string;
  first_mes?: string;
  mes_example?: string;
  scenario?: string;
  creator_notes?: string;
  tags?: string[];
  creator?: string;
  character_version?: string;
  avatar?: string;
  // V2 spec
  spec?: string;
  spec_version?: string;
  data?: {
    name?: string;
    description?: string;
    personality?: string;
    first_mes?: string;
    mes_example?: string;
    scenario?: string;
    creator_notes?: string;
    tags?: string[];
    creator?: string;
    character_version?: string;
    character_book?: any;
    extensions?: Record<string, any>;
    [key: string]: any;
  };
  [key: string]: any;
}

export async function extractCharacterFromPng(file: File): Promise<STCharacterCard> {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);

  // Verify PNG signature
  const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (view.getUint8(i) !== PNG_SIGNATURE[i]) {
      throw new Error('不是有效的 PNG 文件');
    }
  }

  // Walk through chunks looking for tEXt with keyword "chara"
  let offset = 8;
  while (offset < buffer.byteLength) {
    const length = view.getUint32(offset);
    const typeBytes = new Uint8Array(buffer, offset + 4, 4);
    const type = String.fromCharCode(...typeBytes);

    if (type === 'tEXt') {
      const data = new Uint8Array(buffer, offset + 8, length);
      // Find null separator between keyword and text
      let nullIdx = -1;
      for (let i = 0; i < data.length; i++) {
        if (data[i] === 0) {
          nullIdx = i;
          break;
        }
      }
      if (nullIdx > 0) {
        const keyword = new TextDecoder().decode(data.slice(0, nullIdx));
        if (keyword === 'chara') {
          const textData = new TextDecoder().decode(data.slice(nullIdx + 1));
          const json = atob(textData);
          const card = JSON.parse(json) as STCharacterCard;
          return card;
        }
      }
    }

    // Move to next chunk: 4 (length) + 4 (type) + length (data) + 4 (CRC)
    offset += 12 + length;

    if (type === 'IEND') break;
  }

  throw new Error('PNG 文件中未找到角色卡数据（缺少 chara tEXt 块）');
}

export function getCharacterName(card: STCharacterCard): string {
  return card.data?.name || card.name || 'Character';
}

export function getCharacterDescription(card: STCharacterCard): string {
  return card.data?.description || card.description || '';
}

export function getFirstMessage(card: STCharacterCard): string {
  return card.data?.first_mes || card.first_mes || '';
}
