const OPEN_TAG = '<!--json';
const CLOSE_TAG = '-->';

export function serializeMemory(meta, content) {
   const json = JSON.stringify(meta, null, 2);
   return `${OPEN_TAG}\n${json}\n${CLOSE_TAG}\n\n${content}`;
}

export function parseMemory(fileContent) {
   const openIdx = fileContent.indexOf(OPEN_TAG);
   const closeIdx = fileContent.indexOf(CLOSE_TAG);
   if (openIdx === -1 || closeIdx === -1 || closeIdx <= openIdx) {
      return { meta: null, content: fileContent };
   }
   try {
      const jsonStr = fileContent.slice(openIdx + OPEN_TAG.length, closeIdx).trim();
      const meta = JSON.parse(jsonStr);
      const content = fileContent.slice(closeIdx + CLOSE_TAG.length).trim();
      return { meta, content };
   } catch {
      return { meta: null, content: fileContent };
   }
}
