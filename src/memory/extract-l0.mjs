// Regex to find file paths in text (e.g. src/foo.mjs, ./bar/baz.ts, package.json)
const FILE_PATH_RE = /(?:^|[\s`"'(])([.\w/-]+\.\w{1,10})(?=[\s`"'),;:]|$)/gm;
const MAX_SUMMARY_LEN = 120;

export function extractFilePaths(text) {
   const matches = new Set();
   for (const m of text.matchAll(FILE_PATH_RE)) {
      const path = m[1];
      if (path.includes('/') || path.includes('.')) matches.add(path);
   }
   return [...matches].filter(p => !p.startsWith('http') && !p.startsWith('//'));
}

export function extractL0FromMessages(messages, project) {
   if (!messages.length) return { summary: '', project, messageCount: 0, files: [], topics: [] };

   const firstUser = messages.find(m => m.role === 'user');
   const summary = firstUser
      ? firstUser.content.replace(/\n/g, ' ').trim().slice(0, MAX_SUMMARY_LEN)
      : '';

   const files = new Set();
   for (const msg of messages) {
      const text = typeof msg.content === 'string' ? msg.content : '';
      for (const f of extractFilePaths(text)) files.add(f);
   }

   return {
      summary,
      project,
      messageCount: messages.length,
      files: [...files].slice(0, 20),
      timestamp: Date.now(),
   };
}

export function extractL0FromJSONL(lines, project) {
   const messages = [];
   for (const line of lines) {
      try {
         const event = JSON.parse(line);
         if (event.type === 'human' && event.message?.content) {
            const text = typeof event.message.content === 'string'
               ? event.message.content
               : event.message.content.filter(b => b.type === 'text').map(b => b.text).join(' ');
            messages.push({ role: 'user', content: text });
         }
         if (event.type === 'assistant' && event.message?.content) {
            const text = typeof event.message.content === 'string'
               ? event.message.content
               : event.message.content.filter(b => b.type === 'text').map(b => b.text).join(' ');
            messages.push({ role: 'assistant', content: text });
         }
      } catch {}
   }
   return extractL0FromMessages(messages, project);
}
